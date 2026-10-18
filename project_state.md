# Footballdex — project state

**Site:** https://football.laserraptorai.duckdns.org (LIVE)
**Repo:** https://github.com/psvanzyl/football-cards (public, main)
**Home:** dev CT141 `ssh root@192.168.178.20` → `/root/projects/football-cards`
**Deploy:** Coolify CT310 (`root@192.168.178.132`, API `http://192.168.178.132:8000`)
**Updated:** 2026-10-18

## Status: deployed, live, QA'd

- App UUID `ye5i0l9zzdbbrxebnuupu1bc`, project `gi25wjf4smtmu0bgx0bhywne` ("football-cards").
- Build pack `dockerfile`, base directory `/app`, port 3000, health check off, `instant_deploy` off.
- Persistent storage `ye5i0l9zzdbbrxebnuupu1bc-football-data` → `/app/data`.
- TLS: Let's Encrypt cert issued for the hostname (expires 2027-01-16), served by Traefik.
- Last verified commits: `c40ad4d` (stats fallback), `5647276` (light theme default).

## Catalogue

392,499 players · 26,882 teams · 228 countries · 1,092,447 career spells · 68,509 players with a
photograph · 62,964 women / 327,633 men. `data/catalogue.sqlite` ≈ 220 MB, built 2026-10-18.
Rebuild from the raw cache takes ~34 s. `data/` is gitignored — the catalogue is never committed.

## What is deployed

Two files must be in the volume `/app/data` — both, not just the database:

| file | why |
| --- | --- |
| `catalogue.sqlite` | the whole catalogue |
| `stats.json` | headline counts written by the harvest |

The app no longer *depends* on `stats.json` (see below), but it is the exact, instant source.

Host sync copy on CT310: `/data/coolify/football-data/`.

## Known pitfalls (learned the hard way)

1. **Coolify uses the storage `name` verbatim as the docker volume name.** It prefixes the app
   uuid once at creation, so a name typed as `<uuid>-football-data` becomes
   `<uuid>-<uuid>-football-data`. A pre-filled volume under any other name is silently ignored and
   the container mounts a fresh empty one. Always check `docker inspect <ctr> --format
   '{{range .Mounts}}{{.Name}} -> {{.Destination}}{{end}}'` after the first deploy.
2. **A missing `stats.json` used to publish zeroes.** `readStats()` fell back to four SQL counts,
   so every other headline number (notably `withPhoto`) rendered as `0` while the cards were
   showing photographs. `countStats()` now derives all of them in one 20 ms pass over `players`;
   the values were verified to match `stats.json` exactly.
3. **Value spellings in the DB:** `grp` is `gk|def|mid|fwd|unknown` (never NULL); `gender` is
   `m|f|NULL`. Count with those, not with `'male'`/`'female'`.
4. **Dead players have no death date.** Age is printed only for players still playing or under 36;
   everyone else shows a birth year (`ageOrBorn()` in `lib/format.ts`).

## Theme

Light is the **default**, regardless of the OS preference. `globals.css` holds the semantic tokens
twice — light in `:root`, dark under `html.dark` — mapped through `@theme inline`, so every
component is written once. A no-flash inline script in `layout.tsx` sets the class before first
paint; `ThemeToggle` offers light / dark / system and persists to `localStorage`
(`footballdex-theme`). Dark values are byte-identical to the original pitch palette.

## Rebuild / redeploy

```bash
# on CT141
cd /root/projects/football-cards
python3 scripts/harvest.py          # rebuild the catalogue (~34 s from cache)
cd app && npm run build             # tsc + next build
# then push, and deploy from the Coolify UI or:
#   POST /api/v1/deploy {"uuid":"ye5i0l9zzdbbrxebnuupu1bc"}
```

To refresh the deployed catalogue: copy `data/catalogue.sqlite` **and** `data/stats.json` into
`/data/coolify/football-data/` on CT310, then
`cp` them into `/var/lib/docker/volumes/ye5i0l9zzdbbrxebnuupu1bc-football-data/_data/` and restart
the container.

## Verified

- 14 routes green on the production build, slowest 168 ms; `tsc --noEmit` clean.
- Live: 48 cards, all routes 200, zero console errors, zero horizontal overflow at 390 px.
- Theme: light by default with no stored key **and** OS dark; dark toggle applies; choice persists.
- Live hero shows 392,499 / 26,882 / 228 / 68,509 — no phantom zeroes.
