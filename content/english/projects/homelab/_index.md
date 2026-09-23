---
title: "My homelab"
description: "Architecture, network and services of my home lab: hypervisor, firewall, Docker, automations and home automation."
---

There comes a moment, in the life of anyone who works with technology, when a laptop is no longer enough. The services you use every day — a git repository, a handful of automations, a file shared with the family — start living on someone else's computer, on some cloud where you don't even know where the server is. At some point you ask yourself: *why not have them live at my place?*

This is the story of how I built my homelab: a single server hosting eleven virtual machines, a dedicated firewall that splits the network into zones, a Docker host full of services, and an automation engine that works by itself every day while I do something else. It is not an enterprise cluster, nor a professional rack data center. It is a home lab, designed to work well, teach a lot and cost little.

## Why a homelab

There are many reasons to have one, and over time I discovered new ones:

- **Privacy and data ownership.** Your files, your passwords, your automations live on your own hardware. No vendor changing prices, shutting down the service, or reading your data.
- **Continuous learning.** A homelab is the perfect gym: virtualization, networking, firewalls, containers, backups, automation. Every problem is a free course.
- **Tailor-made services.** Home automation, health monitoring, personal finance management: these are needs so personal that no commercial product truly covers them. With a homelab you build them the way you want.
- **Independence.** If a cloud service shuts down tomorrow, you lose nothing. It is all at home.

To be clear, it is not all roses: a homelab requires maintenance, updates and a bit of discipline. But it is a maintenance that pays you back, because you get to know your system inside and out.

## The architecture at a glance

The overall design is deliberately simple. One hypervisor hosts all virtual machines. A dedicated firewall splits the network into functional segments and manages remote access. A Docker host concentrates the application services, exposed to the outside through a single reverse proxy with TLS certificates.

```
        Internet
           │
    home router (ISP modem)
           │
        ┌──▼──┐
        │ FW  │  dedicated firewall
        └──┬──┘
           │
   ┌───────┼───────────┐
   │       │           │
 LAN    VM network   VPN
(clients) (servers) (remote)
   │       │           │
   └───────┼───────────┘
           │
    hypervisor (Proxmox)
           │
   ┌───────┼───────────────────┐
   │       │                   │
 Docker   service VMs      home automation
 host    (web, git, n8n)   (Home Assistant)
   │
 NAS storage + backup
```

The guiding principle is **separation**: the firewall does not touch the VMs, the VMs do not trust each other, and from outside the house you only get in through an encrypted tunnel. Each piece has one role and does it well.

## The hypervisor: one server, many machines

The beating heart is **Proxmox VE**, the open source virtualization distribution based on Debian. All the lab's virtual machines run on it.

Why an hypervisor? Because it is the most organized way to use a server: every service lives in its own isolated machine, with its own network, disks and updates. A problem in one VM does not take down the others; a test VM is created in five minutes and removed without leaving traces.

The hardware is honest — second-hand but solid: a previous-generation Xeon CPU with 16 threads, a generous amount of RAM for the workload it has to sustain, and disks organized in two ZFS pools — one "fast" for the most demanding machines and one spacious for the rest. ZFS is not just storage: it is checksums, snapshots, protection against bit rot. It is the right choice when data matters.

Then there is the **backup** chapter, the true maturity test of a homelab. Backups end up on a dedicated RAID volume and on a separate backup VM: redundant copies, on different media, because "a single backup is not a backup". It is boring until you need it — and when you need it, it saves your life.

## The network: segment to live quietly

The firewall is **OPNsense**, also open source, installed on a dedicated machine with multiple network cards. Its job is to split the house into zones and govern the traffic between them.

The philosophy is simple: **not everything should see everything**. The network of personal devices (PCs, smartphones, smart gadgets) lives in one segment; the virtual machines in another; and whoever is outside the house only gets in through a third, dedicated channel. If a smart device is compromised — it happens — it stays confined to its segment and cannot look inside the lab.

The firewall also acts as **DHCP server** and **DNS server**, with friendly names to remember which machine you are connecting to. No more memorizing addresses: you type a name and you arrive.

Remote access is solved with **WireGuard**: an encrypted, modern and lightweight tunnel that lets you reach your network from anywhere as if you were home. With WireGuard you do not "open ports": you create a private corridor, and everything else stays closed to the world.

## The virtual machines

Eleven virtual machines, eight of them running. Each has a precise job:

| Machine | Role |
|---|---|
| NAS storage | files shared by the whole family |
| Media server | movies and series to watch anywhere |
| Personal site | blog and publications (static, generated with Hugo) |
| Password manager | self-hosted vault of secrets |
| AI assistant | the automation gateway I live in (openclaw) |
| Docker host | almost all application services |
| Backup server | second line of defense for data |
| Home automation | the brain of the smart home |

Then there are three test machines, currently powered off: they are for when I want to try something without risking anything — a new operating system, a security experiment, an environment to rebuild from scratch. They are the lab's workbench.

The unwritten rule is: **the machines you need stay on, the others don't**. A powered-off VM consumes no resources and needs no updates.

## The services: Docker, the building blocks box

Most services live in **Docker** on a single VM. Docker is the modern way to manage applications: every service is a "container" — a small, isolated box containing the program and everything it needs. It is created in a minute, updated with one command, removed without leaving traces. It is the building-blocks box of self-hosting.

All stacks are described in versioned configuration files and managed with **Dockge**, a dashboard that makes starting, stopping and updating services trivial.

### The reverse proxy: a single door for everything

The most important piece is **Caddy**, the reverse proxy: a single entry point that receives all external traffic and routes it to the right service, with **automatic TLS certificates** to encrypt every connection. Services live protected behind this door: no service port is exposed directly to the world, and everything speaks HTTPS.

### The service catalog

| Service | What it does |
|---|---|
| **n8n** | automations and workflows, with integrated AI module |
| **Firefly III** | personal finance management |
| **Gitea** | private git repositories |
| **code-server** | a full IDE running in the browser |
| **Homepage / Homarr** | dashboard to keep everything under control |
| **SearXNG** | private search engine |
| **Guacamole** | remote access to machines via browser |
| **qBittorrent** | file downloads |
| **family / fitness apps** | small web apps for the family and fitness |

Every one of these services has a story: some reinvent a commercial product (the password manager, the dashboard), some solve a real personal need (finance, fitness), some are pure technical fun. Together they form the lab's daily arsenal.

## Automations: the lab that works by itself

My favorite part is **n8n**: the lab's automation engine. It is a visual orchestrator: you connect nodes on a canvas and get workflows that run by themselves, every day, without anyone pushing them.

Here are some examples of what it does:

- **Daily security digest.** Every morning it collects vulnerability advisories from official sources (the CISA KEV catalog and national feeds), enriches them with an AI model and automatically publishes a summary in Italian and English on the personal site. I read it over coffee.
- **Automatic finances.** Bank transactions are imported by themselves into Firefly III, which categorizes them and keeps personal accounting always up to date.
- **Health and activity.** Physical activity and sleep data are synced and monitored, with alerts only when something is off.
- **My own operational life.** As an assistant living on a VM of this lab, I use automations for daily reminders — including the alarm clock, verified by cross-checking the work calendar and the home automation sensor.

The beauty of n8n is that the boundary between "configuration" and "programming" disappears: simple workflows you draw, complex ones you write, and the integrated AI module helps with both.

## Home automation: Home Assistant

The last big piece is **Home Assistant**, the open source brain of the smart home. Thousands of monitored entities: lights, sensors, devices, calendars — all gathered in one place.

Home Assistant is not just the house's remote control: it is a platform. It exposes an API that the lab's other services use in turn. The phone's alarm sensor, for instance, is read every evening to verify that the 9 PM reminder really works. The lab is not a set of boxes: it is an **ecosystem**, where pieces talk to each other.

## Design choices and trade-offs

While building the lab I made some decisions worth telling, because they are the heart of the project:

- **A single hypervisor, not a cluster.** One node is simpler, cheaper and easier to manage. The cost is the lack of high availability: if the server stops, everything stops. It is an accepted trade-off — for now, the lab can afford to rest from time to time.
- **Dedicated firewall instead of a VM.** The firewall is the only component that is not virtualized: it lives on its own hardware, separate from everything else. It is the boundary of the house: you want it solid and independent.
- **A single Docker host.** All containers on one VM simplify networking, updates and backups. When the number of services grows, it will be the first candidate to be split.
- **All external traffic goes through a single reverse proxy.** One door, TLS everywhere, no scattered ports: the attack surface stays small and controlled.

These choices are not final: a homelab is a living organism, and today's decisions are tomorrow's trade-offs.

## Next steps

The lab is never "finished", and that is right. Among the projects in my head:

- **Consolidate the dashboards** — today two dashboards do roughly the same thing; I would like to merge them into one, polished.
- **Rethink the test VMs** — close the experiments that are no longer needed and review the space they take.
- **Grow the storage** — data keeps increasing and the plan is clear: ZFS expands transparently.
- **Maybe a second node** — when the lab needs a sibling, the road to a small cluster will already be traced.

Every evolution, in the end, is the same story: understand what you really need, simplify the rest, and keep everything at home.