import type { Group, PlayerFilters, Sort, SortKey } from "./types";
import { EMPTY_FILTERS } from "./types";

const GROUPS: Group[] = ["gk", "def", "mid", "fwd", "unknown"];
const SORT_KEYS: SortKey[] = [
  "name",
  "born",
  "height",
  "weight",
  "apps",
  "goals",
  "caps",
  "debut",
  "clubs",
  "last",
];

export const PER_PAGE = 48;

/**
 * Sort options live here (not in queries.ts) because the browser needs them too and
 * queries.ts pulls in node:sqlite, which must never reach a client bundle.
 */
export const SORTS: { key: SortKey; label: string; dir: "asc" | "desc"; hint: string }[] = [
  { key: "name", label: "Name", dir: "asc", hint: "A→Z" },
  { key: "apps", label: "Appearances", dir: "desc", hint: "recorded, all stints" },
  { key: "goals", label: "Goals", dir: "desc", hint: "recorded, all stints" },
  { key: "caps", label: "Caps", dir: "desc", hint: "national team" },
  { key: "born", label: "Born", dir: "desc", hint: "newest first" },
  { key: "height", label: "Height", dir: "desc", hint: "tallest first" },
  { key: "weight", label: "Weight", dir: "desc", hint: "heaviest first" },
  { key: "debut", label: "Debut", dir: "desc", hint: "senior debut" },
  { key: "last", label: "Last seen", dir: "desc", hint: "latest stint" },
  { key: "clubs", label: "Clubs", dir: "desc", hint: "most teams" },
];

export const DEFAULT_SORT: Record<SortKey, "asc" | "desc"> = {
  name: "asc",
  born: "desc",
  height: "desc",
  weight: "desc",
  apps: "desc",
  goals: "desc",
  caps: "desc",
  debut: "desc",
  clubs: "desc",
  last: "desc",
};

function csv(v: string | null | undefined): string[] {
  if (!v) return [];
  return v
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function flagOn(v: string | null | undefined): boolean {
  return v === "1" || v === "true" || v === "on";
}

export type ParsedParams = { filters: PlayerFilters; sort: Sort; page: number; per: number };

/**
 * One parser for both the API route (URLSearchParams) and the server pages
 * (searchParams object), so a shared link always renders the same catalogue.
 */
export function readParams(get: (k: string) => string | null, maxPer = 96): ParsedParams {
  const filters: PlayerFilters = {
    ...EMPTY_FILTERS,
    q: (get("q") ?? "").trim(),
    grp: csv(get("grp")).filter((g): g is Group => (GROUPS as string[]).includes(g)),
    pos: csv(get("pos")),
    ctry: csv(get("ctry")).map((c) => c.toUpperCase()).filter((c) => /^[A-Z]{2,6}$/.test(c)),
    team: csv(get("team")).filter((t) => /^Q\d+$/.test(t)),
    decade: csv(get("decade"))
      .map((d) => parseInt(d, 10))
      .filter((d) => Number.isFinite(d) && d >= 1800 && d <= 2030),
    gen: csv(get("gen")).filter((g): g is "m" | "f" => g === "m" || g === "f"),
    active: flagOn(get("active")),
    photo: flagOn(get("photo")),
    nat: flagOn(get("nat")),
  };
  const key = (get("sort") ?? "apps") as SortKey;
  const dir = get("dir");
  const sort: Sort = {
    key: SORT_KEYS.includes(key) ? key : "apps",
    dir: dir === "asc" || dir === "desc" ? dir : DEFAULT_SORT[SORT_KEYS.includes(key) ? key : "apps"],
  };
  const page = Math.max(1, parseInt(get("page") ?? "1", 10) || 1);
  const perRaw = parseInt(get("per") ?? "", 10);
  const per = Number.isFinite(perRaw) ? Math.min(Math.max(perRaw, 12), maxPer) : 48;
  return { filters, sort, page, per };
}

/** Serialise state back into a query string (only non-default values). */
export function toQuery(filters: PlayerFilters, sort: Sort, page: number, per = 48): string {
  const sp = new URLSearchParams();
  if (filters.q) sp.set("q", filters.q);
  if (filters.grp.length) sp.set("grp", filters.grp.join(","));
  if (filters.pos.length) sp.set("pos", filters.pos.join(","));
  if (filters.ctry.length) sp.set("ctry", filters.ctry.join(","));
  if (filters.team.length) sp.set("team", filters.team.join(","));
  if (filters.decade.length) sp.set("decade", filters.decade.join(","));
  if (filters.gen.length) sp.set("gen", filters.gen.join(","));
  if (filters.active) sp.set("active", "1");
  if (filters.photo) sp.set("photo", "1");
  if (filters.nat) sp.set("nat", "1");
  if (sort.key !== "apps" || sort.dir !== "desc") {
    sp.set("sort", sort.key);
    sp.set("dir", sort.dir);
  }
  if (page > 1) sp.set("page", String(page));
  if (per !== 48) sp.set("per", String(per));
  return sp.toString();
}

export function searchParamsToGetter(
  sp: Record<string, string | string[] | undefined>,
): (k: string) => string | null {
  return (k) => {
    const v = sp[k];
    if (Array.isArray(v)) return v[0] ?? null;
    return v ?? null;
  };
}

export function countActive(f: PlayerFilters): number {
  return (
    f.grp.length +
    f.pos.length +
    f.ctry.length +
    f.team.length +
    f.decade.length +
    f.gen.length +
    (f.active ? 1 : 0) +
    (f.photo ? 1 : 0) +
    (f.nat ? 1 : 0)
  );
}
