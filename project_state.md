# football-cards — project state

**Site:** https://football.laserraptorai.duckdns.org — "Footballdex", a card catalogue of every association
football player Wikidata knows about (men and women), searchable, filterable and sortable.
**Home:** dev LXC CT141 (`ssh root@192.168.178.20`) → `/root/projects/football-cards/`
**Repo:** github.com/psvanzyl/football-cards
**Deploy:** Coolify (192.168.178.132:8000, UI/API) → dockerfile build pack, base dir `/app`,
port 3000, FQDN `https://football.laserraptorai.duckdns.org` (wildcard `*.laserraptorai.duckdns.org`).
**Status:** app built and QA'd on the dev box; catalogue built; **not yet deployed**.

## What exists

- `data/catalogue.sqlite` — the shipped snapshot (**392,499 players / 26,882 teams / 228 countries /
  1,092,447 career spells**), 220 MB, built 2026-10-18. **Never committed** (too big for git; mounted
  into the container at `/app/data`).
- `data/raw/*.tsv` — per-step query cache (547 MB, gitignored), resumable harvest.
- `scripts/harvest.py` — QLever Wikidata harvest (`all` / `fetch <step> [--force]` / `build`).
  A full `build` from cache takes ~34 s.
- `app/` — Next.js 16.4.2 (App Router, React 19, Tailwind v4, `output: "standalone"`, `node:sqlite`,
  Dockerfile `node:24-alpine`).
  Routes: `/` catalogue, `/player/[id]`, `/team/[q]`, `/teams`, `/countries`, `/about`,
  `/api/players`, `/api/teams`.

## Data facts (verified)

- Source: Wikidata CC0 via the QLever mirror `https://qlever.dev/api/wikidata`.
- Occupation: association football player **Q937857** (plus the women's-player and
  player-manager classes).
- Coverage: DOB 364,233 · team 341,000+ · position 288,000+ · photo 74,000 · height 93,512 ·
  mass 34,782 · nationality 340,000+ · wiki 221,308 · national caps 54,519 · women 62,964.
- Position groups: gk 30,255 · def 84,122 · mid 102,356 · fwd 71,740 · unknown 104,026.

## Cleaning rules (deliberate, they change the numbers)

1. **Position = most advanced role.** Wikidata stores P413 in arbitrary order, so `pos[0]` made Messi
   and Ronaldo midfielders. `GROUP_PRIORITY = ["gk","fwd","mid","def"]` + `POS_SPECIFICITY` pick the
   most advanced/most specific role.
2. **Career spells are merged, not summed.** The same spell is often recorded twice (Pelé's Santos
   years exist as 1956-1974 *and* 1957-1974) and some rows were fanned out 8×, which produced
   "Pelé 2,464 appearances". `merge_spells()` folds overlapping records per club (widest dates,
   largest tallies); non-overlapping spells (a genuine return) stay separate.
3. **Impossible totals are nulled, not published.** Editors copy qualifiers between statements:
   Coutinho's Santos figures (457 apps / 370 goals) reappear on every later club, and 457 matches do
   not fit in one season. `plausible_spell()` keeps a tally only if it fits the spell's length
   (`MAX_APPS_PER_SEASON = 70`, `MAX_GOALS_PER_SEASON = 100`), else records it as unknown.
4. **Birth years clamped** to `1850..NOW_YEAR-5`; spell end-years in the future → open; start years
   outside `1850..NOW_YEAR` → unknown.
5. **Names kept as-is.** `name_norm` keeps `\p{L}\p{N}`, so non-Latin names survive; search is
   FTS5 (diacritic-insensitive). Rows with an empty `name_norm` sort **last**.
6. Default catalogue sort is **appearances, descending** (not name) — a name-first default opened on
   a wall of non-Latin names.

## Bugs found & fixed (2026-10-18)

1. **`INSERT INTO teams` had 12 placeholders for a 13-column table** — killed the first DB build.
2. **Messi/Ronaldo classed as midfielders** — arbitrary P413 order; fixed with rule 1 above.
3. **Implausible career totals** ("Pelé 2,464 apps", Coutinho 2,306 apps / 1,859 goals) — duplicate
   and copied Wikidata records; fixed with rules 2 + 3. Post-fix leaderboard is the genuine
   long-career set: Pelé 1,273, Peter Shilton 1,143, Torben Boye 1,120, Kazimierz Deyna 1,088,
   Djalma Santos 1,062, Zubizarreta 1,044, Paul Bastock 1,019.
4. **Default view was a wall of empty cards with non-Latin names** — empty `name_norm` sorted first
   and photo-less cards fell back to an invisible monogram; fixed by rule 6 and by a redesigned
   `CardTile` (crest monogram + flag watermark).
5. **`node:sqlite` leaked into the client bundle** via `SORTS` → moved to `lib/params.ts`.
6. `aspect-4/5` is not a Tailwind class → `aspect-[4/5]`.

## Deploy notes

- Coolify storage pattern (copied from Carddex `dpjl3npkr7pxq4xkcwu78tio`): **persistent volume**
  named `<app-uuid>-football-data` mounted at `/app/data`; the DB is copied into the docker volume
  `/var/lib/docker/volumes/<name>/_data/catalogue.sqlite` (a host copy lives at
  `/data/coolify/football-data/` as the sync source).
- Coolify API token: `/root/.hermes/credentials/.coolify_api_token` (never print it).
- Deploy: `POST /api/v1/deploy {"uuid":...}` (GET is 405); poll `/api/v1/deployments/<uuid>` until
  `finished`.
- **Hairpin NAT:** test with `curl -sk --resolve football.laserraptorai.duckdns.org:443:192.168.178.132
  https://football.laserraptorai.duckdns.org/`; `ssl_verify_result=0` proves the Let's Encrypt cert.
- Refresh data without a rebuild: copy a new `catalogue.sqlite` into the volume, restart the container.
- CT310 disk: watch `df -h /` (70% used, 20 G free as of 2026-10-18); stop deploying at 85%.

## Open / next

- Deploy + live QA (desktop and mobile screenshots of every route).
- Optional: a cron that rebuilds the catalogue monthly and swaps the volume file.
