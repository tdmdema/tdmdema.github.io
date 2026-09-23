---
title: "How to limit PHP-FPM with cgroup"
date: 2026-06-01
description: "Practical guide to limit CPU, memory and number of processes for PHP-FPM with cgroup v2: systemd, systemd-run and manual setup with ready-to-apply commands and parameters."
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

PHP-FPM is a robust daemon, but unless it is constrained it can exhaust all the memory of a VPS or a shared server: one misconfigured pool or an attack generating many concurrent requests is enough. The definitive fix is **cgroup v2**, which confines PHP workers inside a process group with limits on **CPU, memory, I/O and number of processes**.

This article shows how to apply limits with three approaches: **systemd** (recommended), **systemd-run** for isolated processes, and **manual cgroup v2** for systems without systemd. All commands assume a modern Linux kernel with cgroup v2 enabled.

## Verify you are on cgroup v2

The limits described here rely on cgroup v2 (the default on all recent distros). Check the filesystem mounted on `/sys/fs/cgroup`:

```bash
stat -fc %T /sys/fs/cgroup
# cgroup2fs  -> cgroup v2
# tmpfs      -> you are on cgroup v1, update the kernel/grub
```

On GRUB you can force cgroup v2 by adding `systemd.unified_cgroup_hierarchy=1` to the boot options. The v2 hierarchy is flat: every cgroup lives in a subdirectory of `/sys/fs/cgroup` and limits are written to the `*.max`, `*.weight` and `*.current` files.

## How the limit applies to PHP-FPM

PHP-FPM is made of one **master** process and a pool of **workers** (the processes that actually run PHP). All the processes of the service live in the same cgroup, so the limits you set apply to the whole group — **cumulatively** for master + workers. That is the key advantage over per-process limits such as `ulimit`.

When the cumulative memory exceeds `memory.max`, the kernel triggers the **OOM killer** which terminates the group's processes; with systemd and `systemd-oomd` the kill is controlled and logged. With `memory.high` instead the group is **throttled**: memory is reclaimed aggressively before OOM kicks in.

## 1. Limits via systemd (recommended approach)

The cleanest way is to add an override drop-in to the `php-fpm` service (the service name varies: `php-fpm`, `php8.3-fpm`, `php-fpm.service`, etc.).

Create `/etc/systemd/system/php-fpm.service.d/limits.conf`:

```ini
[Service]
# Hard limit: above this threshold the OOM killer triggers
MemoryMax=512M
# Soft threshold: above this value the kernel reclaims memory (swap/reclaim) before OOM
MemoryHigh=384M
# Disallow swap entirely for PHP workers
MemorySwapMax=0
# CPU share of one core: 200% = 2 cores
CPUQuota=200%
# Maximum number of processes/threads in the group
TasksMax=128
# Relative I/O priority (100 = default, range 1-10000)
IOWeight=100
```

Apply and verify:

```bash
systemctl daemon-reload
systemctl restart php-fpm

# Show the effective configuration (resolved values, e.g. 536870912 bytes)
systemctl show php-fpm -p MemoryMax -p MemorySwapMax -p CPUQuota -p TasksMax

# Runtime state: current memory and tasks of the group
systemctl status php-fpm
cat /sys/fs/cgroup/system.slice/php-fpm.service/memory.current
cat /sys/fs/cgroup/system.slice/php-fpm.service/pids.current
```

For live usage monitoring use `systemd-cgtop` (sortable by column):

```bash
systemd-cgtop
```

### Guard against memory leaks with systemd-oomd

Enable systemd's OOM daemon so runaway groups are killed in a controlled way instead of leaving the OOM killer to strike at random:

```bash
systemctl enable --now systemd-oomd
```

```ini
[Service]
# 'kill' terminates the processes of the group that exceeds the threshold
ManagedOOMSwap=kill
ManagedOOMMemoryPressure=kill
ManagedOOMMemoryPressureLimit=80%
```

Kills are tracked in `journalctl -u systemd-oomd`.

## 2. Limits for isolated processes with systemd-run

If you want to isolate a single PHP process (e.g. a long-running worker, a CLI script or a pool dedicated to one tenant) without touching the service, launch it inside a **transient scope**:

```bash
systemd-run --scope -p MemoryMax=256M -p CPUQuota=100% -p TasksMax=64 \
  php /path/to/script.php
```

Or create a named scope inside its own slice so it shows up in `systemd-cgtop` and stays manageable:

```bash
systemd-run --unit=tenant-heavy --slice=php-tenants.slice \
  -p MemoryMax=512M -p MemorySwapMax=0 -p CPUQuota=150% -p TasksMax=32 \
  php-fpm-pool-worker.php
```

To stop it: `systemctl stop tenant-heavy` (terminates the whole cgroup, children included).

## 3. Manual setup with cgroup v2 (no systemd)

If your distro does not use systemd, create and populate cgroups by hand. The key files are:

- `memory.max` – hard limit (bytes)
- `memory.high` – reclaim threshold
- `memory.swap.max` – allowed swap
- `cpu.max` – format `quota period` (e.g. `100000 100000` = 1 core)
- `pids.max` – maximum number of processes
- `io.max` / `io.weight` – I/O limits

```bash
# create the cgroup
mkdir -p /sys/fs/cgroup/php-fpm

# set the limits (sizes in bytes)
echo 536870912 > /sys/fs/cgroup/php-fpm/memory.max      # 512M
echo 402653184 > /sys/fs/cgroup/php-fpm/memory.high     # 384M
echo 0         > /sys/fs/cgroup/php-fpm/memory.swap.max # no swap
echo 200000 100000 > /sys/fs/cgroup/php-fpm/cpu.max     # 200% of a core
echo 128       > /sys/fs/cgroup/php-fpm/pids.max        # max 128 tasks

# start the php-fpm master INSIDE the cgroup
echo $$ > /sys/fs/cgroup/php-fpm/cgroup.procs
/usr/sbin/php-fpm --nodaemonize &
```

Every worker spawned by the master automatically inherits the cgroup membership: **you don't need to add them one by one**. To verify:

```bash
# processes in the group
cat /sys/fs/cgroup/php-fpm/cgroup.procs

# current memory and tasks
cat /sys/fs/cgroup/php-fpm/memory.current
cat /sys/fs/cgroup/php-fpm/pids.current

# CPU used (ns) by the group
cat /sys/fs/cgroup/php-fpm/cpu.stat
```

## Tune PHP-FPM so it respects the limits

cgroup limits alone are not enough if PHP-FPM keeps spawning dozens of idle workers. Align the pool (e.g. `/etc/php/8.3/fpm/pool.d/www.conf`) with the available memory and CPU:

```ini
pm = dynamic
pm.max_children = 20
pm.start_servers = 5
pm.min_spare_servers = 3
pm.max_spare_servers = 8
; restart each worker after 500 requests (avoids cumulative memory leaks)
pm.max_requests = 500
; terminate requests that take too long
request_terminate_timeout = 60
```

Set `pm.max_children` based on memory per worker. Estimate: if each worker uses ~24 MB and your cgroup is 512 MB, that leaves ~21 safe workers (use 20 and keep headroom for the master). When workers grow in memory, `pm.max_requests` becomes your safety net together with `memory.high`.

## Multi-tenant: one cgroup per pool

In shared hosting you can give every tenant its own systemd slice with independent limits. Create the slice and the drop-in of the dedicated service:

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

then add `Slice=tenant-www.slice` to the tenant service. This way an exploding tenant never touches the others: the OOM killer hits only its slice.

## Final verification

```bash
systemd-cgtop                          # ranked by memory/CPU
journalctl -u php-fpm -n 50            # service errors and OOM events
cat /sys/fs/cgroup/system.slice/php-fpm.service/memory.events   # counters (oom_kill, max)
cat /sys/fs/cgroup/system.slice/php-fpm.service/memory.peak     # peak memory reached
```

The `oom_kill` counter in `memory.events` tells you at a glance whether the limits are respected or whether you are choking the group too hard (in that case raise `MemoryMax` or lower `pm.max_children`).

## Summary

1. **cgroup v2** is the foundation: verify with `stat -fc %T /sys/fs/cgroup`.
2. **systemd** is the easiest path: a `[Service]` drop-in with `MemoryMax`, `CPUQuota`, `TasksMax`.
3. For single processes use **systemd-run**; without systemd write the limits by hand into the cgroup files.
4. Align the PHP pool (`pm.max_children`, `pm.max_requests`) with the memory limits.
5. In multi-tenant setups use one **slice** per tenant and monitor `memory.events` to know whether the limits are right.