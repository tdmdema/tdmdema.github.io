# tdmdema.github.io — Sito personale di Tommaso De Marchi

Questo repository contiene il sorgente del mio sito personale, pubblicato su [demarchi.xyz](https://demarchi.xyz).

## Che tipo di sito è

È la mia presenza personale sul web. Sono un professionista IT specializzato in infrastrutture Linux, piattaforme di hosting e automazione — oggi COO e Head of Infrastructure presso una società di hosting — e qui racconto chi sono, le cose su cui lavoro e quello che imparo.

## Cosa contiene

- **Blog** — articoli tecnici, con il **CVE Digest** quotidiano pubblicato ogni mattina in italiano e inglese grazie a automazioni con **n8n**.
- **Progetti** — il mio homelab, un sistema di anomaly detection sul traffico di rete e sui log, e il percorso verso la consulenza IT.
- **Chi sono / Servizi / Contatti** — presentazione, cosa faccio e come raggiungermi (in italiano).
- **Now** — un aggiornamento su che cosa sto facendo nel periodo corrente.

Il sito è **bilingue** (italiano e inglese), generato con [Hugo](https://gohugo.io/) e il tema [Hugoplate](https://github.com/zeon-studio/hugoplate), con contenuti scritti in Markdown e pubblicato su GitHub Pages.

## Struttura

- `content/` — i contenuti del sito (`english/` e `italiano/`)
- `layouts/`, `assets/`, `data/`, `config/` — tema, asset e configurazione del sito
- `themes/hugoplate/` — il tema Hugo

## Sviluppo locale

```bash
npm install
npm run dev     # server di sviluppo (http://localhost:1313)
npm run build   # genera il sito nella cartella public/
```