---
title: "AI System for Anomaly Detection"
description: "An anomaly detection project on network traffic and system logs: what I tried, what I learned and why I stopped."
date: 2026-06-01
---

## Goal

The idea was to build a system able to learn the "normal behaviour" of my infrastructure — network traffic and system logs — and to automatically flag deviations, without writing a hand-made rule for every kind of threat. In practice: an anomaly detector trained on my own data, able to notice what it has never seen before.

## Planned architecture

- **Data sources** — Suricata (flows and alerts as EVE JSON), system logs (syslog/journald), reverse proxy web logs, SSH authentication logs, Wazuh alerts and file integrity.
- **Pipeline** — collection → normalization (parsing to structured JSON) → feature extraction → anomaly detection model → scoring → notification.
- **Stack** — Suricata and Wazuh for collection, Python (pandas, scikit-learn) for processing, a small store for the features and a dashboard for visualization.

## Tests and analyses

An experimental phase, in the lab on my homelab.

**Collection.** About three weeks of continuous traffic, roughly 2.4 million Suricata events and 18,000 Wazuh alerts, plus web and authentication logs.

**Features.** I reduced the stream to 5-minute windows: number of connections, distinct destination ports, SYN/ACK ratio, average session duration, bytes in/out, DNS query entropy, share of HTTP 4xx/5xx responses, failed logins, new processes started.

**Models tried.** I compared a baseline of static rules and thresholds with three unsupervised approaches:

| Approach | Recall (known anomalies) | False positives/day |
|---|---|---|
| Static rules + thresholds | ~58% | many, noisy |
| Isolation Forest | ~90% | ~15 |
| One-Class SVM | ~84% | ~22 |
| Autoencoder (neural network) | ~88% | ~11 |

**Injected anomalies.** To validate detection I simulated controlled attacks: port scan, SSH brute force and DNS tunnelling. All three were detected, but with different timings: the port scan almost immediately, the DNS tunnelling only after the volume increased.

**What I learned.** False positives almost all came from legitimate but periodic events — nightly backups, automatic updates, streaming. The model flagged them as anomalies because they were "rare", and it took patient tuning to avoid useless alerts. On top of that, network behaviour changes over time (new devices, new services): the model had to be retrained continuously, or it degraded.

## Observed limitations

- **No labelled data** — without a dataset of "real" anomalies, evaluation stays largely qualitative.
- **Maintenance** — retraining, threshold tuning and false positive handling take constant time.
- **Explainability** — it is hard to say *why* an event is anomalous, and without an explanation it is hard to trust the alert.
- **Alert fatigue** — too many alerts equal no alerts.

## Why I stopped

The project stayed in the lab phase, and it never went further for a simple reason: **with the AI explosion came tools that already do this — and do it better than I could have done alone in a personal project**. Starting from scratch today would mean rewriting something that already exists, mature and maintained by others.

A few examples:

- **Open source** — Elastic Security (with built-in anomaly detection jobs), Wazuh itself, CrowdSec for behavioural detection and community intelligence, SELKS (Suricata + ELK), ntopng.
- **Commercial** — Darktrace, Vectra AI, Microsoft Sentinel / Defender XDR, Splunk, Palo Alto Cortex XSIAM.
- **AI SOC assistants** — Microsoft Security Copilot, Dropzone AI, Radiant Security: virtual analysts that triage alerts and investigate for you.

The lesson is that, in this field, today it makes more sense to **integrate** existing tools than to build them from scratch. The project remains as a learning exercise on feature engineering and unsupervised models: the skills stayed, the code did not.

## Status

Archived. In practice, replaced by the tools listed above.
