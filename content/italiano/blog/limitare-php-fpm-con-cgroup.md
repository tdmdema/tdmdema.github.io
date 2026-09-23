---
title: "Come limitare PHP-FPM con cgroup"
date: 2026-06-01
description: "Guida tecnica per limitare CPU, memoria e numero di processi di PHP-FPM con cgroup v2: systemd, systemd-run e configurazione manuale con comandi e parametri da applicare."
tags:
  - linux
  - php-fpm
  - cgroup
  - systemd
  - hosting
  - devops
  - performance
  - oom
categories:
  - infrastructure
draft: false
---

PHP-FPM è un demone robusto, ma se non viene limitato può consumare tutta la memoria di una VPS o di un server condiviso: basta una pool mal configurata o un attacco che genera molte richieste concorrenti. La soluzione definitiva è usare **cgroup v2** per confinare i worker PHP all'interno di un gruppo di processi con limiti di **CPU, memoria, I/O e numero di processi**.

Questo articolo spiega come applicare i limiti con tre approcci: **systemd** (consigliato), **systemd-run** per processi isolati e **cgroup v2 manuale** per chi non usa systemd. Tutti i comandi presuppongono un kernel Linux moderno con cgroup v2 abilitato.

## Verificare di essere su cgroup v2

I limiti descritti funzionano con cgroup v2 (il default su tutte le distro recenti). Verifica il filesystem montato su `/sys/fs/cgroup`:

```bash
stat -fc %T /sys/fs/cgroup
# cgroup2fs  -> cgroup v2
# tmpfs      -> stai usando cgroup v1, aggiorna il kernel/grub
```

Su GRUB puoi forzare cgroup v2 aggiungendo al boot `systemd.unified_cgroup_hierarchy=1`. La gerarchia v2 è flat: ogni cgroup vive in una sottodirectory di `/sys/fs/cgroup` e i limiti si scrivono nei file `*.max`, `*.weight` e `*.current`.

## Come funziona il limite applicato a PHP-FPM

PHP-FPM è composto da un processo **master** e da un pool di **worker** (i processi che eseguono il PHP vero e proprio). Tutti i processi del servizio vivono nello stesso cgroup: i limiti che imposti sul cgroup valgono per l'intero gruppo, quindi **cumulativamente** per master + worker. Questo è il punto di forza rispetto a limiti "per singolo processo" come `ulimit`.

Quando la memoria cumulativa supera `memory.max`, il kernel attiva l'**OOM killer** che termina i processi del gruppo; con systemd e `systemd-oomd` la morte è controllata e loggata. Con `memory.high` invece il gruppo viene **throttlato**: la memoria viene recuperata in modo aggressivo prima che scatti l'OOM.

## 1. Limiti via systemd (approccio consigliato)

Il modo più pulito è aggiungere un drop-in di override al servizio `php-fpm` (il nome del servizio varia: `php-fpm`, `php8.3-fpm`, `php-fpm.service`, ecc.).

Crea il file `/etc/systemd/system/php-fpm.service.d/limits.conf`:

```ini
[Service]
# Limite rigido: sopra questa soglia scatta l'OOM killer
MemoryMax=512M
# Soglia morbida: sopra questa soglia il kernel recupera memoria (swap/reclaim) prima di OOM
MemoryHigh=384M
# Vieta completamente lo swap per i worker PHP
MemorySwapMax=0
# Percentuale di CPU su un core: 200% = 2 core
CPUQuota=200%
# Numero massimo di processi/thread nel gruppo
TasksMax=128
# Priorità I/O relativa (100 = default, range 1-10000)
IOWeight=100
```

Applica e verifica:

```bash
systemctl daemon-reload
systemctl restart php-fpm

# Mostra la configurazione effettiva (con i valori risolti, es. 536870912 byte)
systemctl show php-fpm -p MemoryMax -p MemorySwapMax -p CPUQuota -p TasksMax

# Stato a runtime: memoria e task correnti del gruppo
systemctl status php-fpm
cat /sys/fs/cgroup/system.slice/php-fpm.service/memory.current
cat /sys/fs/cgroup/system.slice/php-fpm.service/pids.current
```

Per un monitoraggio live dei consumi usa `systemd-cgtop` (ordinabile per colonna):

```bash
systemd-cgtop
```

### Protezione dal memory leak con systemd-oomd

Attiva il demone OOM di systemd per far terminare in modo controllato i gruppi che sforano, invece di lasciare che l'OOM killer colpisca a caso:

```bash
systemctl enable --now systemd-oomd
```

```ini
[Service]
# 'kill' termina i processi del gruppo che supera la soglia
ManagedOOMSwap=kill
ManagedOOMMemoryPressure=kill
ManagedOOMMemoryPressureLimit=80%
```

I kill sono tracciati in `journalctl -u systemd-oomd`.

## 2. Limiti per processi isolati con systemd-run

Se vuoi isolare un singolo processo PHP (es. un worker long-running, uno script CLI o un pool dedicato a un tenant) senza toccare il servizio, lancia tutto dentro uno **scope transiente**:

```bash
systemd-run --scope -p MemoryMax=256M -p CPUQuota=100% -p TasksMax=64 \
  php /path/to/script.php
```

Oppure crea uno scope con nome e slice dedicata, così lo ritrovi in `systemd-cgtop` e puoi gestirlo:

```bash
systemd-run --unit=tenant-heavy --slice=php-tenants.slice \
  -p MemoryMax=512M -p MemorySwapMax=0 -p CPUQuota=150% -p TasksMax=32 \
  php-fpm-pool-worker.php
```

Per fermarlo: `systemctl stop tenant-heavy` (termina l'intero cgroup, inclusi i processi figli).

## 3. Setup manuale con cgroup v2 (senza systemd)

Se la tua distro non usa systemd, crea e popola i cgroup a mano. I file chiave sono:

- `memory.max` – limite rigido (bytes)
- `memory.high` – soglia di reclaim
- `memory.swap.max` – swap ammesso
- `cpu.max` – formato `quota period` (es. `100000 100000` = 1 core)
- `pids.max` – numero massimo di processi
- `io.max` / `io.weight` – limiti I/O

```bash
# crea il cgroup
mkdir -p /sys/fs/cgroup/php-fpm

# imposta i limiti (grandezze in byte)
echo 536870912 > /sys/fs/cgroup/php-fpm/memory.max      # 512M
echo 402653184 > /sys/fs/cgroup/php-fpm/memory.high     # 384M
echo 0         > /sys/fs/cgroup/php-fpm/memory.swap.max # nessuno swap
echo 200000 100000 > /sys/fs/cgroup/php-fpm/cpu.max     # 200% di un core
echo 128       > /sys/fs/cgroup/php-fpm/pids.max        # max 128 task

# avvia il master php-fpm DENTRO il cgroup
echo $$ > /sys/fs/cgroup/php-fpm/cgroup.procs
/usr/sbin/php-fpm --nodaemonize &
```

Ogni worker generato dal master eredita automaticamente l'appartenenza al cgroup: **non devi aggiungerli uno a uno**. Per verificare:

```bash
# processi del gruppo
cat /sys/fs/cgroup/php-fpm/cgroup.procs

# memoria e task attuali
cat /sys/fs/cgroup/php-fpm/memory.current
cat /sys/fs/cgroup/php-fpm/pids.current

# CPU usata (ns) dal gruppo
cat /sys/fs/cgroup/php-fpm/cpu.stat
```

## Sintonizzare PHP-FPM perché rispetti i limiti

I limiti a livello cgroup non bastano se PHP-FPM continua a creare decine di worker "a vuoto". Allinea la pool (es. `/etc/php/8.3/fpm/pool.d/www.conf`) al limite di memoria e CPU disponibile:

```ini
pm = dynamic
pm.max_children = 20
pm.start_servers = 5
pm.min_spare_servers = 3
pm.max_spare_servers = 8
; riavvia ogni worker dopo 500 richieste (evita memory leak cumulativi)
pm.max_requests = 500
; termina le richieste troppo lunghe
request_terminate_timeout = 60
```

Regola `pm.max_children` in base alla memoria per worker. Stima: se ogni worker usa ~24 MB e hai un cgroup da 512 MB, restano ~21 worker sicuri (metti 20 e tieni margine per il master). In caso di worker che crescono di memoria, `pm.max_requests` diventa la tua rete di sicurezza insieme a `memory.high`.

## Multi-tenant: un cgroup per ogni pool

In hosting condiviso puoi dare a ogni tenant la propria slice systemd con limiti indipendenti. Crea lo slice e il drop-in del servizio dedicato:

```bash
cat > /etc/systemd/system/tenant-www.slice <<'EOF'
[Slice]
MemoryMax=1G
MemorySwapMax=0
CPUQuota=300%
TasksMax=200
EOF
systemctl daemon-reload
```

poi aggiungi al servizio del tenant `Slice=tenant-www.slice`. In questo modo un tenant che esplode non tocca mai gli altri: l'OOM killer colpisce solo la sua slice.

## Verifica finale

```bash
systemd-cgtop                          # classifica per memoria/CPU
journalctl -u php-fpm -n 50            # errori ed eventi OOM del servizio
cat /sys/fs/cgroup/system.slice/php-fpm.service/memory.events   # contatori (oom_kill, max)
cat /sys/fs/cgroup/system.slice/php-fpm.service/memory.peak     # picco di memoria raggiunto
```

La chiave `oom_kill` in `memory.events` ti dice immediatamente se i limiti sono stati rispettati oppure se stai strozzando troppo il gruppo (in tal caso aumenti `MemoryMax` o riduci `pm.max_children`).

## Riepilogo

1. **cgroup v2** è la base: verifica con `stat -fc %T /sys/fs/cgroup`.
2. **systemd** è la via più semplice: drop-in `[Service]` con `MemoryMax`, `CPUQuota`, `TasksMax`.
3. Per processi singoli usa **systemd-run**; senza systemd scrivi i limiti a mano nei file del cgroup.
4. Allinea la pool PHP (`pm.max_children`, `pm.max_requests`) ai limiti di memoria.
5. In multi-tenant usa una **slice** per tenant e monitora `memory.events` per capire se i limiti sono corretti.