import type { Group } from "./types";

export type GroupMeta = {
  label: string;
  short: string;
  chip: string;
  bar: string;
  dot: string;
  text: string;
};

/** Position-group styling. Colours are per group so a card reads at a glance. */
export const GROUPS: Record<Group, GroupMeta> = {
  gk: {
    label: "Goalkeeper",
    short: "GK",
    chip: "bg-gk/15 text-gk border-gk/40",
    bar: "bg-gk",
    dot: "bg-gk",
    text: "text-gk",
  },
  def: {
    label: "Defender",
    short: "DEF",
    chip: "bg-def/15 text-def border-def/40",
    bar: "bg-def",
    dot: "bg-def",
    text: "text-def",
  },
  mid: {
    label: "Midfielder",
    short: "MID",
    chip: "bg-turf/15 text-turf border-turf/40",
    bar: "bg-turf",
    dot: "bg-turf",
    text: "text-turf",
  },
  fwd: {
    label: "Forward",
    short: "FWD",
    chip: "bg-fwd/15 text-fwd border-fwd/40",
    bar: "bg-fwd",
    dot: "bg-fwd",
    text: "text-fwd",
  },
  unknown: {
    label: "Position unrecorded",
    short: "—",
    chip: "bg-pitch-800 text-muted border-line",
    bar: "bg-pitch-600",
    dot: "bg-pitch-600",
    text: "text-muted",
  },
};

export const GROUP_ORDER: Group[] = ["gk", "def", "mid", "fwd", "unknown"];

/** Country flag emoji from an ISO 3166-1 alpha-2 code (with the UK home nations). */
export function flag(iso: string | null | undefined): string {
  if (!iso) return "🏳️";
  const s = iso.toLowerCase();
  const special: Record<string, string> = {
    "gb-eng": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    "gb-sct": "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
    "gb-wls": "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
    "gb-nir": "🇬🇧",
    eng: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    sco: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
    wal: "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
    nir: "🇬🇧",
  };
  if (special[s]) return special[s];
  if (!/^[a-z]{2}$/.test(s)) return "🏳️";
  return String.fromCodePoint(...[...s].map((c) => 0x1f1e6 + c.charCodeAt(0) - 97));
}

export function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function nfmt(v: number | null | undefined): string {
  if (v == null) return "–";
  return v.toLocaleString("en-GB");
}

export function height(cm: number | null | undefined): string {
  if (!cm) return "–";
  return `${(cm / 100).toFixed(2)} m`;
}

export function weight(kg: number | null | undefined): string {
  if (!kg) return "–";
  return `${kg} kg`;
}

/** Ages are anchored to the catalogue's build year so they do not drift between deploys. */
export function age(birthYear: number | null | undefined, refYear: number): string {
  if (!birthYear) return "–";
  const a = refYear - birthYear;
  return a > 0 && a < 120 ? String(a) : "–";
}

/**
 * A player's age — or their birth year when an age would be a guess.
 *
 * Wikidata death dates are not harvested, so a birth year alone cannot prove that someone
 * is alive: Pelé (born 1940) would read "age 86" on a card. An age is therefore printed
 * only for players who are still playing or are young enough to be alive with certainty;
 * everyone else shows the birth year, which is true either way.
 */
export function ageOrBorn(
  birthYear: number | null | undefined,
  refYear: number,
  stillPlaying = false,
): { label: string; value: string } {
  if (!birthYear) return { label: "age", value: "–" };
  const a = refYear - birthYear;
  if (stillPlaying || (a > 0 && a <= 35)) return { label: "age", value: String(a) };
  return { label: "born", value: String(birthYear) };
}

export function span(from: number | null | undefined, to: number | null | undefined, open = false): string {
  if (!from && !to) return "dates unrecorded";
  if (from && (open || !to)) return `${from}–present`;
  if (!from && to) return `–${to}`;
  return from === to ? String(from) : `${from}–${to}`;
}

export function decadeLabel(d: number): string {
  if (d < 1900) return "pre-1900";
  return `${d}s`;
}

export function posLabel(p: string | null | undefined, grp: Group): string {
  return p ?? GROUPS[grp].label;
}

export function wikiUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith("http") ? url : null;
}

/** Format a stat that may be null: unrecorded is not zero. */
export function stat(v: number | null | undefined): string {
  return v == null ? "–" : String(v);
}
