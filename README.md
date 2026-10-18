# Footballdex — every footballer in the world, searchable

A card catalogue of every association football player Wikidata knows about:
**392,499 players · 26,882 teams · 228 countries · 1,092,447 career spells**.

Live: https://football.laserraptorai.duckdns.org

## Layout

- `scripts/harvest.py` — QLever/Wikidata harvest. `all` (fetch + build), `fetch <step> [--force]`,
  `build` (assemble SQLite from the on-disk cache). A rebuild from cache takes ~34 s.
- `data/catalogue.sqlite` — the shipped snapshot (220 MB, **gitignored**, mounted into the container
  at `/app/data`).
- `data/raw/*.tsv` — resumable per-step query cache (547 MB, gitignored).
- `app/` — Next.js 16 app (App Router, React 19, Tailwind v4, `node:sqlite`, standalone output).

## Run locally

```bash
cd app && npm install
FOOTBALL_DATA_DIR=../data npm run dev     # http://localhost:3000
```

## Rebuild the catalogue

```bash
python3 scripts/harvest.py all            # first run: fetch everything (slow), then build
python3 scripts/harvest.py build          # later runs: reassemble from cache (~34 s)
```

The build applies the documented cleaning rules (most-advanced position, merged career spells,
plausibility caps on copied Wikidata totals) — see `/about` on the live site or `project_state.md`.

## Deploy

Coolify (dockerfile build pack, base directory `/app`, port 3000) with a persistent volume at
`/app/data` holding `catalogue.sqlite`. Refreshing data needs no rebuild: copy the new file into the
volume and restart the container. Details in `project_state.md`.
