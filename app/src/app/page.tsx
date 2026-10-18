import Link from "next/link";
import { Catalogue } from "@/components/Catalogue";
import { nfmt } from "@/lib/format";
import { countActive, readParams, searchParamsToGetter } from "@/lib/params";
import { getFacets, listPlayers } from "@/lib/queries";
import type { Stats } from "@/lib/types";

export const dynamic = "force-dynamic";

function Stat({ value, label, accent }: { value: number | string | undefined; label: string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-pitch-900/70 px-4 py-3">
      <p className={`font-display text-2xl leading-none ${accent ?? "text-turf"}`}>{nfmt(Number(value ?? 0))}</p>
      <p className="mt-1 text-[11px] uppercase tracking-wider text-muted">{label}</p>
    </div>
  );
}

function Quick({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-full border border-line bg-pitch-900/70 px-3.5 py-1.5 text-[13px] text-fg/85 transition hover:border-turf/50 hover:text-turf"
    >
      {children}
    </Link>
  );
}

function Hero({ stats, topCountries, topPositions }: { stats: Stats; topCountries: string[]; topPositions: string[] }) {
  return (
    <section className="pitch-glow relative mb-6 overflow-hidden rounded-3xl border border-line bg-pitch-900/60 px-5 py-8 sm:px-8 sm:py-10">
      <div className="pitch-lines pointer-events-none absolute inset-0 opacity-60" />
      <div className="relative">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-turf">Association football · worldwide</p>
        <h1 className="font-display text-4xl uppercase leading-[0.95] text-fg sm:text-6xl">
          Every footballer
          <br />
          <span className="text-turf">in the world.</span>
        </h1>
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-muted">
          A card catalogue of every association football player Wikidata knows about — clubs, national teams,
          positions, birth years, heights and career records. Search it, filter it, sort it. No account, no
          tracking, no paywall.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Stat value={stats.players} label="players" />
          <Stat value={stats.teams} label="teams" accent="text-def" />
          <Stat value={stats.countries} label="countries" accent="text-flash" />
          <Stat value={stats.withPhoto} label="with a photo" accent="text-fwd" />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Quick href="/?grp=fwd">Forwards</Quick>
          <Quick href="/?grp=gk">Goalkeepers</Quick>
          <Quick href="/?gen=f">Women&rsquo;s football</Quick>
          <Quick href="/?active=1">Still playing</Quick>
          <Quick href="/?decade=1990">Born in the 1990s</Quick>
          {topPositions.slice(0, 2).map((p) => (
            <Quick key={p} href={`/?pos=${encodeURIComponent(p)}`}>
              {p}
            </Quick>
          ))}
          {topCountries.map((c) => (
            <Quick key={c} href={`/?ctry=${c}`}>
              {c}
            </Quick>
          ))}
        </div>
      </div>
    </section>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const { filters, sort, page, per } = readParams(searchParamsToGetter(sp));
  const facets = getFacets();
  const initial = listPlayers(filters, sort, page, per);
  const refYear =
    parseInt(String(facets.stats.generated ?? "").slice(0, 4), 10) || new Date().getFullYear();
  const showHero = countActive(filters) === 0 && !filters.q && page === 1;

  return (
    <>
      {showHero && (
        <Hero
          stats={facets.stats}
          topCountries={facets.countries.slice(0, 3).map((c) => c.iso ?? "").filter(Boolean)}
          topPositions={facets.positions.slice(0, 4).map((p) => p.name)}
        />
      )}
      <Catalogue
        initial={initial}
        facets={facets}
        initialFilters={filters}
        initialSort={sort}
        refYear={refYear}
      />
    </>
  );
}
