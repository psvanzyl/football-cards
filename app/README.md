# Footballdex

A searchable, filterable, sortable card catalogue of association football players
worldwide, served at **https://football.laserraptorai.duckdns.org**.

Sister project of `rugby-cards` (same architecture, different sport and dataset).

## What it does

- **390,597 players** (327,633 men, 62,964 women) with club and national-team careers
- **1.1 million** career stints, **26k+** teams, **340+** nationalities
- Full-text search over player names (SQLite FTS5, diacritic-insensitive)
- Filters: position group, canonical position, country, club/national team (typeahead),
  birth decade, gender, still-playing, has-photo, has-national-team
- Sorts: name, appearances, goals, caps, birth year, height, weight, debut, last seen, clubs
- Per-player pages with a career timeline; per-team squad pages; country browser
- All filtering/sorting happens server-side against SQLite — no client dataset download

## Architecture

```
scripts/harvest.py        # SPARQL harvest from Wikidata via QLever → SQLite
data/catalogue.sqlite     # built artefact (~220 MB), mounted read-only at /app/data
data/stats.json           # coverage counters, rendered on /about
app/                      # Next.js 16 app router (this directory)
  src/lib/db.ts           # node:sqlite connection (read-only), path resolution
  src/lib/queries.ts      # all SQL: filters, sorts, facets, squads
  src/lib/params.ts       # shared URL ⇄ state parser (server + client)
  src/app/api/players     # JSON API backing the client catalogue
  src/app/api/teams       # team typeahead
  src/app/player/[id]     # player detail + career timeline
  src/app/team/[q]        # team detail + squad
  src/app/teams           # team index
  src/app/countries       # country index
  src/app/about           # method, coverage, limits
```

Data source: Wikidata (CC0) through the QLever mirror — no scraping, no API keys.

## Rebuilding the catalogue

```bash
python3 scripts/harvest.py fetch     # paginated SPARQL, cached under data/raw/
python3 scripts/harvest.py build     # assemble data/catalogue.sqlite + stats.json
python3 scripts/harvest.py all       # both
```

Fetch responses are cached, so `build` can be re-run cheaply after a cleaning fix.

## Running locally

```bash
npm install
FOOTBALL_DATA_DIR=../data npm run dev     # http://localhost:3000
```

Requires **Node 23.4+** (unflagged `node:sqlite`); the Dockerfile uses `node:24-alpine`.

## Deploying

Coolify builds the image from GitHub (standalone Next output). The catalogue is
**not** in the image: a Coolify persistent storage mounts the host directory holding
`catalogue.sqlite` at `/app/data`. Without that mount the site renders a clear
"catalogue not mounted" notice rather than failing.
