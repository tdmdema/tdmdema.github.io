---
title: "Sistema AI per il rilevamento anomalie"
description: "Un progetto di anomaly detection su traffico di rete e log di sistema: cosa ho provato, cosa ho imparato e perché non sono più andato avanti."
date: 2026-06-01
---

## Obiettivo

L'idea era costruire un sistema capace di imparare il "comportamento normale" della mia infrastruttura — traffico di rete e log di sistema — e di segnalare automaticamente le deviazioni, senza dover scrivere a mano una regola per ogni tipo di minaccia. In pratica: un rilevatore di anomalie addestrato sui miei dati, in grado di accorgersi di ciò che non ha mai visto prima.

## Architettura ipotizzata

- **Sorgenti dati** — Suricata (flussi e alert in formato EVE JSON), log di sistema (syslog/journald), log web del reverse proxy, log di autenticazione SSH, alert e integrità dei file da Wazuh.
- **Pipeline** — raccolta → normalizzazione (parsing verso JSON strutturato) → estrazione delle feature → modello di anomaly detection → scoring → notifica.
- **Stack** — Suricata e Wazuh per la raccolta, Python (pandas, scikit-learn) per l'elaborazione, un piccolo storage per le feature e una dashboard per la visualizzazione.

## Test e analisi fatti

Fase sperimentale, in laboratorio sul mio homelab.

**Raccolta.** Circa tre settimane di traffico continuo, per un totale di ~2,4 milioni di eventi Suricata e ~18.000 alert Wazuh, più i log web e di autenticazione.

**Feature.** Ho ridotto il flusso a finestre di 5 minuti: numero di connessioni, porte di destinazione distinte, rapporto SYN/ACK, durata media delle sessioni, byte in/out, entropia delle query DNS, quota di risposte HTTP 4xx/5xx, tentativi di login falliti, nuovi processi avviati.

**Modelli provati.** Ho confrontato un baseline a regole e soglie statiche con tre approcci non supervisionati:

| Approccio | Recall (anomalie note) | Falsi positivi/giorno |
|---|---|---|
| Regole + soglie statiche | ~58% | molti, rumorosi |
| Isolation Forest | ~90% | ~15 |
| One-Class SVM | ~84% | ~22 |
| Autoencoder (rete neurale) | ~88% | ~11 |

**Anomalie iniettate.** Per validare il rilevamento ho simulato attacchi controllati: port scan, brute force SSH e DNS tunneling. Tutti e tre sono stati individuati, ma con tempi diversi: il port scan quasi immediatamente, il DNS tunneling solo dopo l'aumento di volume.

**Cosa ho imparato.** I falsi positivi arrivavano quasi tutti da eventi legittimi ma periodici — backup notturni, aggiornamenti automatici, streaming. Il modello li classificava come anomali perché "rari", e serviva un tuning paziente per non generare allarmi inutili. Inoltre il comportamento della rete cambia nel tempo (nuovi dispositivi, nuovi servizi): il modello andava riaddestrato con continuità, altrimenti degradava.

## Limiti emersi

- **Niente dati etichettati** — non avendo un dataset di anomalie "vere", la valutazione resta in gran parte qualitativa.
- **Manutenzione** — riaddestramento, tuning delle soglie e gestione dei falsi positivi richiedono tempo costante.
- **Spiegabilità** — è difficile dire *perché* un evento risulti anomalo, e senza una spiegazione è difficile fidarsi dell'allarme.
- **Alert fatigue** — troppi avvisi equivalgono a nessun avviso.

## Perché mi sono fermato

Il progetto è rimasto in fase di laboratorio, e non è più andato avanti per una ragione semplice: **con l'esplosione dell'AI sono arrivati strumenti che fanno già questo — e lo fanno meglio di quanto avrei potuto fare io da solo in un progetto personale**. Ripartire da zero oggi significherebbe riscrivere qualcosa che esiste già, maturo e mantenuto da altri.

Alcuni esempi:

- **Open source** — Elastic Security (con job di anomaly detection integrati), Wazuh stesso, CrowdSec per il rilevamento comportamentale e la community di intelligence, SELKS (Suricata + ELK), ntopng.
- **Commerciali** — Darktrace, Vectra AI, Microsoft Sentinel / Defender XDR, Splunk, Palo Alto Cortex XSIAM.
- **Assistenti AI per il SOC** — Microsoft Security Copilot, Dropzone AI, Radiant Security: analisti virtuali che fanno triage degli alert e indagano al posto tuo.

La lezione è che, in questo campo, oggi conviene **integrare** gli strumenti esistenti piuttosto che costruirli da zero. Il progetto resta come esercizio di apprendimento su feature engineering e modelli non supervisionati: le competenze sono rimaste, il codice no.

## Stato

Archiviato. Sostituito, di fatto, dagli strumenti citati sopra.
