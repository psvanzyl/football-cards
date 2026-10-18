import type { Metadata } from "next";
import Link from "next/link";
import { flag, nfmt } from "@/lib/format";
import { listTeams, type TeamSort } from "@/lib/queries";
import type { Team } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Teams",
  description:
    "Every club and national team in the Footballdex catalogue, with squad sizes and recorded appearance totals.",
};

const KINDS = [
  { key: "", label: "Everything" },
  { key: "club", label: "Clubs" },
  { key: "national", label: "National teams" },
  { key: "women", label: "Women's national" },
  { key: "youth", label: "Youth national" },
];

const SORT_OPTIONS: { key: TeamSort; label: string }[] = [
  { key: "players", label: "Most players" },
  { key: "apps", label: "Most appearances" },
  { key: "goals", label: "Most goals" },
  { key: "name", label: "Name A→Z" },
  { key: "founded", label: "Oldest first" },
];

function Tile({ t }: { t: Team }) {
  return (
    <Link
      href={`/team/${t.q}`}
      className="card-shadow flex items-center gap-3 rounded-2xl border border-line bg-pitch-900 px-3.5 py-3 transition hover:-translate-y-0.5 hover:border-turf/50 hover:bg-pitch-850"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-pitch-850 text-xl">
        {t.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.logo} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-contain p-1" />
        ) : (
          <span>{flag(t.iso)}</span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold text-fg/90">{t.name}</span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
          {t.country && <span className="truncate">{t.country}</span>}
          {t.national && <span className="rounded-full bg-flash/15 px-1.5 py-0.5 uppercase text-flash">nat</span>}
          {t.kind === "national-w" && <span className="rounded-full bg-fwd/15 px-1.5 py-0.5 uppercase text-fwd">w</span>}
          {t.inception && <span>est. {t.inception}</span>}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-display text-lg leading-none text-turf">{nfmt(t.players)}</span>
        <span className="text-[10px] uppercase tracking-wider text-muted">players</span>
      </span>
    </Link>
  );
}

export default async function TeamsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const get = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
  };
  const q = get("q");
  const kind = get("kind");
  const sort = (get("sort") || "players") as TeamSort;
  const page = Math.max(1, parseInt(get("page") || "1", 10) || 1);
  const { teams, total, pages } = listTeams({ q, kind }, sort, page);

  const link = (patch: Record<string, string>) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (kind) p.set("kind", kind);
    if (sort !== "players") p.set("sort", sort);
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const s = p.toString();
    return `/teams${s ? `?${s}` : ""}`;
  };

  return (
    <div className="rise">
      <header className="pitch-glow mb-5 rounded-3xl border border-line bg-pitch-900/60 px-5 py-7 sm:px-7">
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-turf">Clubs &amp; countries</p>
        <h1 className="font-display text-4xl uppercase leading-none sm:text-5xl">Teams</h1>
        <p className="mt-2.5 max-w-2xl text-[13px] leading-relaxed text-muted">
          Every club side and national team that appears in a player&rsquo;s career history — {nfmt(total)} matching
          right now. Open a team to see the players who turned out for it.
        </p>
      </header>

      <form action="/teams" method="get" className="mb-4 flex flex-col gap-2.5 rounded-2xl border border-line bg-pitch-900/70 p-3.5 sm:flex-row sm:items-center">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search teams…"
          className="flex-1 rounded-xl border border-line bg-pitch-850 px-3 py-2.5 text-[14px] outline-none placeholder:text-muted/60 focus:border-turf/60"
        />
        <select
          name="kind"
          defaultValue={kind}
          className="rounded-xl border border-line bg-pitch-850 px-2.5 py-2.5 text-[13px] outline-none focus:border-turf/60"
        >
          {KINDS.map((k) => (
            <option key={k.key} value={k.key}>
              {k.label}
            </option>
          ))}
        </select>
        <select
          name="sort"
          defaultValue={sort}
          className="rounded-xl border border-line bg-pitch-850 px-2.5 py-2.5 text-[13px] outline-none focus:border-turf/60"
        >
          {SORT_OPTIONS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-xl border border-turf/50 bg-turf/10 px-4 py-2.5 text-[13px] text-turf transition hover:bg-turf/20">
          Apply
        </button>
      </form>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {KINDS.map((k) => (
          <Link
            key={k.key}
            href={link({ kind: k.key, page: "" })}
            className={`rounded-full border px-3 py-1.5 text-[12px] transition ${
              kind === k.key
                ? "border-turf bg-turf/15 text-turf"
                : "border-line bg-pitch-900 text-muted hover:border-turf/40 hover:text-fg"
            }`}
          >
            {k.label}
          </Link>
        ))}
      </div>

      {teams.length === 0 ? (
        <p className="rounded-2xl border border-line bg-pitch-900/60 px-5 py-12 text-center text-[13px] text-muted">
          No teams match that search.
        </p>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {teams.map((t) => (
            <Tile key={t.q} t={t} />
          ))}
        </div>
      )}

      {pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2 text-[13px]">
          {page > 1 && (
            <Link href={link({ page: String(page - 1) })} className="rounded-lg border border-line bg-pitch-900 px-3 py-1.5 hover:border-turf/50">
              ← Previous
            </Link>
          )}
          <span className="text-muted">
            page {nfmt(page)} of {nfmt(pages)}
          </span>
          {page < pages && (
            <Link href={link({ page: String(page + 1) })} className="rounded-lg border border-line bg-pitch-900 px-3 py-1.5 hover:border-turf/50">
              Next →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
