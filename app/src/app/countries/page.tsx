import type { Metadata } from "next";
import Link from "next/link";
import { flag, nfmt } from "@/lib/format";
import { getFacets } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Countries",
  description:
    "Browse the Footballdex catalogue by country: every nationality with a recorded squad of association football players.",
};

export default async function CountriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const get = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
  };
  const q = get("q").trim().toLowerCase();
  const sort = get("sort") || "players";

  const all = getFacets().countries.filter((c) => c.iso);
  const filtered = q
    ? all.filter((c) => (c.name ?? "").toLowerCase().includes(q) || (c.iso ?? "").toLowerCase().includes(q))
    : all;
  const list = [...filtered].sort((a, b) =>
    sort === "name" ? (a.name ?? "").localeCompare(b.name ?? "") : b.players - a.players,
  );
  const link = (patch: Record<string, string>) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (sort !== "players") p.set("sort", sort);
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const s = p.toString();
    return `/countries${s ? `?${s}` : ""}`;
  };

  return (
    <div className="rise">
      <header className="pitch-glow mb-5 rounded-3xl border border-line bg-pitch-900/60 px-5 py-7 sm:px-7">
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-turf">Nationalities</p>
        <h1 className="font-display text-4xl uppercase leading-none sm:text-5xl">Countries</h1>
        <p className="mt-2.5 max-w-2xl text-[13px] leading-relaxed text-muted">
          {nfmt(all.length)} nationalities with players in the catalogue. Open one to see every footballer recorded
          for it, filterable by position, club and era.
        </p>
      </header>

      <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <form action="/countries" method="get" className="flex flex-1 gap-2.5">
          <input
            name="q"
            defaultValue={get("q")}
            placeholder="Search countries…"
            className="flex-1 rounded-xl border border-line bg-pitch-850 px-3 py-2.5 text-[14px] outline-none placeholder:text-muted/60 focus:border-turf/60"
          />
          {sort !== "players" && <input type="hidden" name="sort" value={sort} />}
          <button type="submit" className="rounded-xl border border-turf/50 bg-turf/10 px-4 py-2.5 text-[13px] text-turf hover:bg-turf/20">
            Search
          </button>
        </form>
        <div className="flex gap-1.5">
          <Link
            href={link({ sort: "", })}
            className={`rounded-full border px-3 py-1.5 text-[12px] ${
              sort === "players" ? "border-turf bg-turf/15 text-turf" : "border-line bg-pitch-900 text-muted hover:text-fg"
            }`}
          >
            Most players
          </Link>
          <Link
            href={link({ sort: "name" })}
            className={`rounded-full border px-3 py-1.5 text-[12px] ${
              sort === "name" ? "border-turf bg-turf/15 text-turf" : "border-line bg-pitch-900 text-muted hover:text-fg"
            }`}
          >
            A→Z
          </Link>
        </div>
      </div>

      {list.length === 0 ? (
        <p className="rounded-2xl border border-line bg-pitch-900/60 px-5 py-12 text-center text-[13px] text-muted">
          No countries match that search.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {list.map((c) => (
            <Link
              key={c.q}
              href={`/?ctry=${c.iso}`}
              className="card-shadow flex items-center gap-3 rounded-2xl border border-line bg-pitch-900 px-3.5 py-3 transition hover:-translate-y-0.5 hover:border-turf/50 hover:bg-pitch-850"
            >
              <span className="text-2xl leading-none">{flag(c.iso)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-fg/90">{c.name ?? c.q}</span>
                <span className="text-[11px] text-muted">{c.iso}</span>
              </span>
              <span className="shrink-0 font-display text-lg leading-none text-turf">{nfmt(c.players)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
