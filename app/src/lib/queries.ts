import fs from "node:fs";
import path from "node:path";
import { all, dbPath, ftsReady, one } from "./db";
import type {
  CardPlayer,
  CareerStint,
  Country,
  Facets,
  Group,
  PlayerDetail,
  PlayerFilters,
  PlayerPage,
  PositionFacet,
  Sort,
  SortKey,
  Stats,
  Team,
} from "./types";

export const PER_PAGE = 48;

const SORT_COLUMN: Record<SortKey, string> = {
  name: "p.name_norm",
  born: "p.birth_year",
  height: "p.height_cm",
  weight: "p.weight_kg",
  apps: "p.apps",
  goals: "p.goals",
  caps: "p.nat_caps",
  debut: "p.first_year",
  last: "p.last_year",
  clubs: "p.team_count",
};

const SELECT_CARD = `
  p.id, p.name, p.grp, p.pos, p.pos_json, p.country_iso, p.country_name, p.img, p.num,
  p.dob, p.birth_year, p.height_cm, p.weight_kg, p.cur_team, p.nat_team,
  p.apps, p.goals, p.nat_caps, p.nat_goals, p.first_year, p.last_year, p.is_open,
  p.team_count, p.stints, p.wiki,
  tc.name AS club_name, tn.name AS nat_name`;

const FROM_CARD = `FROM players p
  LEFT JOIN teams tc ON tc.q = p.cur_team
  LEFT JOIN teams tn ON tn.q = p.nat_team`;

function num(v: unknown): number | null {
  return typeof v === "number" ? v : v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.length ? v : null;
}

type Row = Record<string, unknown>;

function toCard(r: Row): CardPlayer {
  let positions: string[] = [];
  const pj = str(r.pos_json);
  if (pj) {
    try {
      const parsed = JSON.parse(pj);
      if (Array.isArray(parsed)) positions = parsed.filter((x): x is string => typeof x === "string");
    } catch {
      positions = [];
    }
  }
  return {
    id: String(r.id),
    name: String(r.name),
    grp: (str(r.grp) ?? "unknown") as Group,
    pos: str(r.pos),
    positions,
    iso: str(r.country_iso),
    country: str(r.country_name),
    img: str(r.img),
    num: num(r.num),
    dob: str(r.dob),
    birthYear: num(r.birth_year),
    height: num(r.height_cm),
    weight: num(r.weight_kg),
    clubQ: str(r.cur_team),
    club: str(r.club_name),
    natQ: str(r.nat_team),
    natTeam: str(r.nat_name),
    apps: num(r.apps),
    goals: num(r.goals),
    natCaps: num(r.nat_caps),
    natGoals: num(r.nat_goals),
    firstYear: num(r.first_year),
    lastYear: num(r.last_year),
    open: Number(r.is_open) === 1,
    clubCount: num(r.team_count) ?? 0,
    stints: num(r.stints) ?? 0,
    wiki: str(r.wiki),
  };
}

/** Split a search box into tokens the FTS index (or the LIKE fallback) can use. */
export function tokenize(q: string): string[] {
  return q
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter((t) => t.length > 0)
    .slice(0, 6);
}

export function buildWhere(f: PlayerFilters): { sql: string; params: unknown[] } {
  const w: string[] = [];
  const p: unknown[] = [];

  const tokens = tokenize(f.q);
  if (tokens.length) {
    if (ftsReady()) {
      w.push("p.rowid IN (SELECT rowid FROM player_fts WHERE player_fts MATCH ?)");
      p.push(tokens.map((t) => `"${t}"*`).join(" AND "));
    } else {
      for (const t of tokens) {
        w.push("p.name_norm LIKE ?");
        p.push(`%${t}%`);
      }
    }
  }

  if (f.grp.length) {
    w.push(`p.grp IN (${f.grp.map(() => "?").join(",")})`);
    p.push(...f.grp);
  }
  if (f.pos.length) {
    // A player can hold several positions; pos_json keeps them all, so match any.
    w.push(`(${f.pos.map(() => "p.pos_json LIKE ?").join(" OR ")})`);
    p.push(...f.pos.map((x) => `%"${x}"%`));
  }
  if (f.ctry.length) {
    w.push(`p.country_iso IN (${f.ctry.map(() => "?").join(",")})`);
    p.push(...f.ctry);
  }
  if (f.team.length) {
    w.push(`p.id IN (SELECT pid FROM stints WHERE team IN (${f.team.map(() => "?").join(",")}))`);
    p.push(...f.team);
  }
  if (f.decade.length) {
    w.push(`(${f.decade.map(() => "(p.birth_year >= ? AND p.birth_year < ?)").join(" OR ")})`);
    for (const d of f.decade) p.push(d, d + 10);
  }
  if (f.gen.length) {
    w.push(`p.gender IN (${f.gen.map(() => "?").join(",")})`);
    p.push(...f.gen);
  }
  if (f.active) w.push("p.is_open = 1");
  if (f.photo) w.push("p.img IS NOT NULL");
  if (f.nat) w.push("p.nat_team IS NOT NULL");

  return { sql: w.length ? `WHERE ${w.join(" AND ")}` : "", params: p };
}

function orderBy(sort: Sort): string {
  const col = SORT_COLUMN[sort.key] ?? "p.name_norm";
  // A name that cannot be folded to ASCII (Greek, Arabic, Cyrillic, Hangul) has an
  // empty name_norm and would otherwise sort ahead of every Latin name. Sink those
  // to the end instead, so an alphabetical listing starts where a reader expects.
  const nameless = "(p.name_norm IS NULL OR p.name_norm = '') ASC, p.name_norm ASC";
  if (sort.key === "name") {
    return `ORDER BY (p.name_norm IS NULL OR p.name_norm = '') ASC, ${col} ${
      sort.dir === "desc" ? "DESC" : "ASC"
    }, p.id`;
  }
  // Nulls always sort last, whatever the direction: an unrecorded height is not "0 cm".
  return `ORDER BY (${col} IS NULL) ASC, ${col} ${
    sort.dir === "desc" ? "DESC" : "ASC"
  }, ${nameless}, p.id`;
}

export function listPlayers(f: PlayerFilters, sort: Sort, page: number, per = PER_PAGE): PlayerPage {
  const where = buildWhere(f);
  const total = num(one<{ n: number }>(`SELECT COUNT(*) AS n FROM players p ${where.sql}`, where.params)?.n) ?? 0;
  const pages = Math.max(1, Math.ceil(total / per));
  const safePage = Math.min(Math.max(1, page), pages);
  const rows = all<Row>(
    `SELECT ${SELECT_CARD} ${FROM_CARD} ${where.sql} ${orderBy(sort)} LIMIT ? OFFSET ?`,
    [...where.params, per, (safePage - 1) * per],
  );
  return { total, page: safePage, per, pages, sort, players: rows.map(toCard) };
}

export function getPlayer(id: string): PlayerDetail | null {
  const row = one<Row>(
    `SELECT ${SELECT_CARD}, p.birthplace, p.country_extra, p.gender ${FROM_CARD} WHERE p.id = ?`,
    [id],
  );
  if (!row) return null;
  const card = toCard(row);
  const career: CareerStint[] = all<Row>(
    `SELECT s.team AS q, t.name AS team, s.start, s.end, s.apps, s.goals, s.nat,
            t.country_iso AS iso, t.kind
     FROM stints s LEFT JOIN teams t ON t.q = s.team
     WHERE s.pid = ?
     ORDER BY (s.start IS NULL) ASC, s.start ASC, (s.end IS NULL) DESC, s.end ASC, t.name ASC`,
    [id],
  ).map((r) => ({
    q: String(r.q),
    team: str(r.team) ?? String(r.q),
    start: num(r.start),
    end: num(r.end),
    apps: num(r.apps),
    goals: num(r.goals),
    national: Number(r.nat) === 1,
    iso: str(r.iso),
    kind: str(r.kind),
  }));
  let extra: { iso: string; name: string | null }[] = [];
  const ce = str(row.country_extra);
  if (ce) {
    try {
      const parsed = JSON.parse(ce);
      if (Array.isArray(parsed)) {
        extra = parsed
          .filter((x) => Array.isArray(x) && typeof x[0] === "string")
          .map((x) => ({ iso: String(x[0]), name: x[1] == null ? null : String(x[1]) }));
      }
    } catch {
      extra = [];
    }
  }
  return { ...card, birthplace: str(row.birthplace), extra, career };
}

export function similarPlayers(p: CardPlayer, limit = 6): CardPlayer[] {
  if (!p.iso && p.grp === "unknown") return [];
  const rows = all<Row>(
    `SELECT ${SELECT_CARD} ${FROM_CARD}
     WHERE p.id != ? AND p.grp = ? ${p.iso ? "AND p.country_iso = ?" : ""}
     ORDER BY (p.apps IS NULL) ASC, p.apps DESC, p.name_norm ASC LIMIT ?`,
    p.iso ? [p.id, p.grp, p.iso, limit] : [p.id, p.grp, limit],
  );
  return rows.map(toCard);
}

export function getTeam(q: string): Team | null {
  const r = one<Row>(
    `SELECT q, name, country_q, country_name, country_iso, national, kind, logo, inception,
            players, apps, goals FROM teams WHERE q = ?`,
    [q],
  );
  if (!r) return null;
  return {
    q: String(r.q),
    name: String(r.name),
    countryQ: str(r.country_q),
    country: str(r.country_name),
    iso: str(r.country_iso),
    national: Number(r.national) === 1,
    kind: str(r.kind) ?? "club",
    logo: str(r.logo),
    inception: num(r.inception),
    players: num(r.players) ?? 0,
    apps: num(r.apps),
    goals: num(r.goals),
  };
}

export type SquadMember = {
  player: CardPlayer;
  start: number | null;
  end: number | null;
  apps: number | null;
  goals: number | null;
};

export type SquadSort = "name" | "start" | "apps" | "goals" | "born";

const SQUAD_ORDER: Record<SquadSort, string> = {
  name: "p.name_norm ASC",
  start: "(MIN(s.start) IS NULL) ASC, MIN(s.start) DESC",
  apps: "(SUM(s.apps) IS NULL) ASC, SUM(s.apps) DESC",
  goals: "(SUM(s.goals) IS NULL) ASC, SUM(s.goals) DESC",
  born: "(p.birth_year IS NULL) ASC, p.birth_year DESC",
};

export function teamSquad(
  teamQ: string,
  sort: SquadSort,
  page: number,
  per = PER_PAGE,
): { total: number; page: number; pages: number; members: SquadMember[] } {
  const total = num(one<{ n: number }>(`SELECT COUNT(DISTINCT pid) AS n FROM stints WHERE team = ?`, [teamQ])?.n) ?? 0;
  const pages = Math.max(1, Math.ceil(total / per));
  const safePage = Math.min(Math.max(1, page), pages);
  const rows = all<Row>(
    `SELECT ${SELECT_CARD},
            MIN(s.start) AS st_start, MAX(COALESCE(s.end, s.start)) AS st_end,
            SUM(s.apps) AS st_apps, SUM(s.goals) AS st_goals
     ${FROM_CARD}
     JOIN stints s ON s.pid = p.id
     WHERE s.team = ?
     GROUP BY p.id
     ORDER BY ${SQUAD_ORDER[sort] ?? SQUAD_ORDER.name}, p.name_norm ASC
     LIMIT ? OFFSET ?`,
    [teamQ, per, (safePage - 1) * per],
  );
  return {
    total,
    page: safePage,
    pages,
    members: rows.map((r) => ({
      player: toCard(r),
      start: num(r.st_start),
      end: num(r.st_end),
      apps: num(r.st_apps),
      goals: num(r.st_goals),
    })),
  };
}

export type TeamFilters = { q: string; kind: string };

export type TeamSort = "players" | "apps" | "goals" | "name" | "founded";

const TEAM_ORDER: Record<TeamSort, string> = {
  players: "players DESC",
  apps: "(apps IS NULL) ASC, apps DESC",
  goals: "(goals IS NULL) ASC, goals DESC",
  name: "name_norm ASC",
  founded: "(inception IS NULL) ASC, inception ASC",
};

export function listTeams(f: TeamFilters, sort: TeamSort, page: number, per = 48) {
  const w: string[] = [];
  const p: unknown[] = [];
  if (f.q.trim()) {
    const q = f.q
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^0-9a-z]+/g, " ")
      .trim();
    if (q) {
      w.push("name_norm LIKE ?");
      p.push(`%${q}%`);
    }
  }
  if (f.kind === "club") w.push("kind = 'club'");
  if (f.kind === "national") w.push("national = 1");
  if (f.kind === "women") w.push("kind = 'national-w'");
  if (f.kind === "youth") w.push("kind IN ('national-youth')");
  const where = w.length ? `WHERE ${w.join(" AND ")}` : "";
  const total = num(one<{ n: number }>(`SELECT COUNT(*) AS n FROM teams ${where}`, p)?.n) ?? 0;
  const pages = Math.max(1, Math.ceil(total / per));
  const safePage = Math.min(Math.max(1, page), pages);
  const rows = all<Row>(
    `SELECT q, name, country_q, country_name, country_iso, national, kind, logo, inception,
            players, apps, goals FROM teams ${where}
     ORDER BY ${TEAM_ORDER[sort] ?? TEAM_ORDER.players}, name_norm ASC LIMIT ? OFFSET ?`,
    [...p, per, (safePage - 1) * per],
  );
  const teams: Team[] = rows.map((r) => ({
    q: String(r.q),
    name: String(r.name),
    countryQ: str(r.country_q),
    country: str(r.country_name),
    iso: str(r.country_iso),
    national: Number(r.national) === 1,
    kind: str(r.kind) ?? "club",
    logo: str(r.logo),
    inception: num(r.inception),
    players: num(r.players) ?? 0,
    apps: num(r.apps),
    goals: num(r.goals),
  }));
  return { total, page: safePage, pages, teams };
}

/** Typeahead for the team filter: prefix matches first, then the biggest clubs. */
export function searchTeams(q: string, limit = 10): Team[] {
  const norm = q
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^0-9a-z]+/g, " ")
    .trim();
  if (norm.length < 2) return [];
  const rows = all<Row>(
    `SELECT q, name, country_q, country_name, country_iso, national, kind, logo, inception,
            players, apps, goals
     FROM teams WHERE name_norm LIKE ?
     ORDER BY (name_norm LIKE ?) DESC, (national) ASC, players DESC LIMIT ?`,
    [`%${norm}%`, `${norm}%`, limit],
  );
  return rows.map((r) => ({
    q: String(r.q),
    name: String(r.name),
    countryQ: str(r.country_q),
    country: str(r.country_name),
    iso: str(r.country_iso),
    national: Number(r.national) === 1,
    kind: str(r.kind) ?? "club",
    logo: str(r.logo),
    inception: num(r.inception),
    players: num(r.players) ?? 0,
    apps: num(r.apps),
    goals: num(r.goals),
  }));
}

export function teamsByQids(qids: string[]): Record<string, Team> {
  if (!qids.length) return {};
  const rows = all<Row>(
    `SELECT q, name, country_q, country_name, country_iso, national, kind, logo, inception,
            players, apps, goals FROM teams WHERE q IN (${qids.map(() => "?").join(",")})`,
    qids,
  );
  const out: Record<string, Team> = {};
  for (const r of rows) {
    out[String(r.q)] = {
      q: String(r.q),
      name: String(r.name),
      countryQ: str(r.country_q),
      country: str(r.country_name),
      iso: str(r.country_iso),
      national: Number(r.national) === 1,
      kind: str(r.kind) ?? "club",
      logo: str(r.logo),
      inception: num(r.inception),
      players: num(r.players) ?? 0,
      apps: num(r.apps),
      goals: num(r.goals),
    };
  }
  return out;
}

// ---------------------------------------------------------------- facets & stats

let facetCache: Facets | null = null;

function readStats(): Stats {
  const p = dbPath();
  if (p) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(path.dirname(p), "stats.json"), "utf8"));
      if (j && typeof j === "object") return j as Stats;
    } catch {
      /* no stats.json beside the catalogue — count everything from the database instead */
    }
  }
  return countStats();
}

/**
 * Every headline number, in a single pass over `players`. The catalogue ships as a bare
 * .sqlite file, so stats.json (written by the harvest) is easily left behind; deriving the
 * counts here keeps a missing file from quietly publishing zeroes — which is exactly how
 * "0 with a photo" went live while the cards were showing photographs.
 */
function countStats(): Stats {
  const r =
    one<Record<string, number>>(
      `SELECT COUNT(*) AS players,
              SUM(grp = 'gk') AS gk, SUM(grp = 'def') AS def,
              SUM(grp = 'mid') AS mid, SUM(grp = 'fwd') AS fwd,
              SUM(grp NOT IN ('gk', 'def', 'mid', 'fwd')) AS noPosition,
              SUM(img IS NOT NULL) AS withPhoto,
              SUM(wiki IS NOT NULL) AS withWiki,
              SUM(country_q IS NOT NULL) AS withCountry,
              SUM(dob IS NOT NULL) AS withDob,
              SUM(height_cm IS NOT NULL) AS withHeight,
              SUM(weight_kg IS NOT NULL) AS withMass,
              SUM(cur_team IS NOT NULL) AS withTeam,
              SUM(pos IS NOT NULL) AS withPosition,
              SUM(lower(gender) IN ('f', 'female')) AS women,
              SUM(lower(gender) IN ('m', 'male')) AS men
       FROM players`,
    ) ?? {};
  const n = (k: string) => num(r[k]) ?? 0;
  const tableCount = (sql: string) => {
    try {
      return num(one<{ n: number }>(sql)?.n) ?? 0;
    } catch {
      return 0; /* a table this catalogue does not have */
    }
  };
  return {
    players: n("players"),
    teams: tableCount("SELECT COUNT(*) AS n FROM teams"),
    clubs: tableCount("SELECT COUNT(*) AS n FROM teams WHERE kind = 'club'"),
    nationalTeams: tableCount("SELECT COUNT(*) AS n FROM teams WHERE kind = 'national'"),
    countries: tableCount("SELECT COUNT(*) AS n FROM countries"),
    positions: tableCount("SELECT COUNT(*) AS n FROM positions"),
    stints: tableCount("SELECT COUNT(*) AS n FROM stints"),
    women: n("women"),
    men: n("men"),
    gk: n("gk"),
    def: n("def"),
    mid: n("mid"),
    fwd: n("fwd"),
    noPosition: n("noPosition"),
    withTeam: n("withTeam"),
    withPosition: n("withPosition"),
    withPhoto: n("withPhoto"),
    withCountry: n("withCountry"),
    withDob: n("withDob"),
    withHeight: n("withHeight"),
    withMass: n("withMass"),
    withWiki: n("withWiki"),
  };
}

export function getFacets(): Facets {
  if (facetCache) return facetCache;
  const stats = readStats();
  const positions = all<{ name: string; grp: string | null; players: number }>(
    "SELECT name, grp, players FROM positions ORDER BY players DESC, name ASC",
  ).map((r) => ({ name: r.name, grp: (r.grp ?? "unknown") as Group, players: num(r.players) ?? 0 }));
  const countries: Country[] = all<Row>(
    "SELECT q, name, iso2, iso3, players FROM countries ORDER BY players DESC, name ASC",
  ).map((r) => ({
    q: String(r.q),
    name: str(r.name),
    iso: str(r.iso2),
    iso3: str(r.iso3),
    players: num(r.players) ?? 0,
  }));
  const decades = all<{ decade: number; count: number }>(
    `SELECT (birth_year / 10) * 10 AS decade, COUNT(*) AS count FROM players
     WHERE birth_year IS NOT NULL AND birth_year > 1850 GROUP BY decade ORDER BY decade ASC`,
  ).map((r) => ({ decade: num(r.decade) ?? 0, count: num(r.count) ?? 0 }));
  const groups = (["gk", "def", "mid", "fwd", "unknown"] as Group[])
    .map((key) => ({
      key,
      count: num(stats[key === "unknown" ? "noPosition" : key]) ?? 0,
    }))
    .filter((g) => g.count > 0);
  facetCache = { stats, positions, countries, decades, groups };
  return facetCache;
}

export function getStats(): Stats {
  return getFacets().stats;
}
