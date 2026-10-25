import type { Metadata } from "next";
import Link from "next/link";
import { nfmt } from "@/lib/format";
import { getStats } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "About & method",
  description:
    "How the Footballdex catalogue is built from Wikidata: sources, coverage, filtering rules and known limits.",
};

function Row({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-line/50 py-2 first:border-t-0">
      <div className="min-w-0">
        <p className="text-[13px] text-fg/90">{label}</p>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-pitch-850">
          <span className="block h-full rounded-full bg-turf/60" style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
      </div>
      <p className="shrink-0 text-right text-[12px] text-muted">
        <span className="font-semibold text-fg/85">{nfmt(value)}</span>
        <span className="ml-1.5">{pct}%</span>
      </p>
    </div>
  );
}

export default function AboutPage() {
  const s = getStats();
  const players = Number(s.players ?? 0);
  const num = (k: string) => Number(s[k] ?? 0);

  return (
    <div className="rise mx-auto max-w-3xl">
      <header className="border-b border-line/70 bg-gradient-to-b from-surface to-canvas px-3 py-4 sm:px-5 sm:py-5">
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-turf">Method &amp; limits</p>
        <h1 className="font-display text-4xl uppercase leading-none sm:text-5xl">About Footballdex</h1>
        <p className="mt-2.5 text-[13px] leading-relaxed text-muted">
          A card catalogue of every association football player that Wikidata knows about — {nfmt(players)} of them —
          built so that you can actually search it. No account, no tracking, no paywall.
        </p>
      </header>

      <section className="rounded-2xl border border-line bg-pitch-900/60 px-5 py-5">
        <h2 className="font-display text-2xl uppercase tracking-wide">Where the data comes from</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-fg/85">
          Everything here is derived from{" "}
          <a href="https://www.wikidata.org" target="_blank" rel="noreferrer noopener" className="text-turf hover:underline">
            Wikidata
          </a>
          , the free knowledge base released under CC0. The harvest runs against the{" "}
          <a href="https://qlever.dev/api/wikidata" target="_blank" rel="noreferrer noopener" className="text-turf hover:underline">
            QLever mirror
          </a>
          , which holds a complete copy of Wikidata and answers SPARQL queries over it. No scraping of Wikipedia HTML,
          no third-party API keys, no per-request costs.
        </p>
        <p className="mt-3 text-[13px] leading-relaxed text-fg/85">
          A player is included when their occupation is <em>association football player</em>. For each one we pull
          their names in every available language, date of birth, height, mass, photo, citizenship, birthplace,
          position(s), shirt number, Wikipedia link, and every club or national team stint with the recorded
          appearances and goals.
        </p>
      </section>

      <section className="mt-4 rounded-2xl border border-line bg-pitch-900/60 px-5 py-5">
        <h2 className="font-display text-2xl uppercase tracking-wide">Coverage</h2>
        <p className="mt-1.5 text-[12px] text-muted">
          Live numbers from this build. Wikidata is volunteer-maintained, so coverage is uneven — a player with a
          Wikipedia article in a well-covered league has far more fields filled than one from a smaller competition.
        </p>
        <div className="mt-3">
          <Row label="Players in the catalogue" value={players} total={players} />
          <Row label="With a club or national team on record" value={num("withTeam")} total={players} />
          <Row label="With a position" value={num("withPosition")} total={players} />
          <Row label="With a nationality" value={num("withCountry")} total={players} />
          <Row label="With a date of birth" value={num("withDob")} total={players} />
          <Row label="With a photo" value={num("withPhoto")} total={players} />
          <Row label="With a height" value={num("withHeight")} total={players} />
          <Row label="With a weight" value={num("withMass")} total={players} />
          <Row label="With recorded club appearances" value={num("withCaps")} total={players} />
          <Row label="With recorded national caps" value={num("withNatCaps")} total={players} />
          <Row label="With a Wikipedia article" value={num("withWiki")} total={players} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {[
            { l: "goalkeepers", v: num("gk") },
            { l: "defenders", v: num("def") },
            { l: "midfielders", v: num("mid") },
            { l: "forwards", v: num("fwd") },
            { l: "teams", v: num("teams") },
            { l: "countries", v: num("countries") },
            { l: "career stints", v: num("stints") },
            { l: "women", v: num("women") },
          ].map((x) => (
            <div key={x.l} className="rounded-xl border border-line bg-pitch-850/60 px-3 py-2">
              <p className="font-display text-xl leading-none text-turf">{nfmt(x.v)}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted">{x.l}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-line bg-pitch-900/60 px-5 py-5">
        <h2 className="font-display text-2xl uppercase tracking-wide">How it is built</h2>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-[13px] leading-relaxed text-fg/85">
          <li>
            <strong className="text-fg">Harvest.</strong> Paginated SPARQL queries against the QLever mirror fetch
            players, names, career stints, teams and the supporting metadata. Every response is cached on disk, so a
            failed step can be retried without re-querying the whole thing.
          </li>
          <li>
            <strong className="text-fg">Clean.</strong> Fictional characters, stage names and items with no usable
            name are dropped. Positions in dozens of languages are normalised onto {nfmt(num("positions"))} canonical
            position names, grouped into goalkeepers, defenders, midfielders and forwards.
          </li>
          <li>
            <strong className="text-fg">Assemble.</strong> The result is a single SQLite catalogue with an FTS5
            full-text index over player names, plus team and country indexes for filtering.
          </li>
          <li>
            <strong className="text-fg">Serve.</strong> This site reads that file read-only. Searching, filtering and
            sorting happen server-side in milliseconds, so it works the same on a phone as on a desktop.
          </li>
        </ol>
      </section>

      <section className="mt-4 rounded-2xl border border-line bg-pitch-900/60 px-5 py-5">
        <h2 className="font-display text-2xl uppercase tracking-wide">Cleaning rules</h2>
        <p className="mt-1.5 text-[12px] text-muted">
          Wikidata is edited by hand, so a raw dump is not usable as a reference. These are the rules applied at
          build time. They are deliberate, and they change the numbers.
        </p>
        <ul className="mt-3 space-y-2.5 text-[13px] leading-relaxed text-fg/85">
          <li>
            <strong className="text-fg">One position per player.</strong> A player can list several positions and
            Wikidata stores them in no particular order, so the most advanced role wins: forward over midfielder over
            defender over goalkeeper. A player listed as both winger and striker is a forward here.
          </li>
          <li>
            <strong className="text-fg">Career spells are merged, not added up.</strong> The same spell is often
            recorded twice — Pelé&apos;s Santos years exist as both 1956-1974 and 1957-1974. Overlapping records for
            one club are folded into a single spell with the widest dates and the largest totals, so his career reads
            1,273 appearances rather than roughly double that. A genuine return to a former club stays two spells.
          </li>
          <li>
            <strong className="text-fg">Impossible totals are dropped, not published.</strong> Editors copy figures
            between statements, so Coutinho&apos;s Santos record (457 appearances, 370 goals) reappears on every later
            club he joined — and 457 matches do not fit in one season at Vitória. A spell&apos;s totals are kept only
            if they fit the length of that spell (at most 70 appearances and 100 goals per season); otherwise they are
            shown as not recorded.
          </li>
          <li>
            <strong className="text-fg">Birth years must be plausible.</strong> Anything outside 1850 to five years ago
            is discarded, which removes the occasional typo (a player &ldquo;born&rdquo; in 2038).
          </li>
          <li>
            <strong className="text-fg">Names are kept, not translated.</strong> Every language&apos;s label is
            harvested and search matches any of them. Players whose only labels are in a non-Latin script keep their
            own name and sort after the Latin-alphabet names rather than into the middle of them.
          </li>
        </ul>
      </section>

      <section className="mt-4 rounded-2xl border border-line bg-pitch-900/60 px-5 py-5">
        <h2 className="font-display text-2xl uppercase tracking-wide">What this is not</h2>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-[13px] leading-relaxed text-fg/85">
          <li>
            <strong className="text-fg">Not live.</strong> This is a snapshot, rebuilt by re-running the harvest.
            Transfers and new debuts appear after the next rebuild.
          </li>
          <li>
            <strong className="text-fg">Not complete.</strong> &ldquo;Every footballer in the world&rdquo; means every
            footballer Wikidata has an item for. Plenty of amateur and lower-league players are simply not in the
            source.
          </li>
          <li>
            <strong className="text-fg">Not a stat provider.</strong> Appearance and goal totals are only present
            where Wikidata records them, and are per stint — a dash means &ldquo;not recorded&rdquo;, not
            &ldquo;zero&rdquo;.
          </li>
          <li>
            <strong className="text-fg">Ages are anchored</strong> to the build date of the catalogue rather than to
            your clock, so they stay consistent between visits.
          </li>
        </ul>
      </section>

      <section className="mt-4 rounded-2xl border border-line bg-pitch-900/60 px-5 py-5">
        <h2 className="font-display text-2xl uppercase tracking-wide">Rebuilding</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-fg/85">
          The harvest is a single Python script: it re-queries only what is missing, then rebuilds the SQLite
          catalogue. Corrections made in Wikidata therefore flow through on the next run.
        </p>
        <p className="mt-3 text-[12px] text-muted">
          Catalogue built {String(s.generated ?? "unknown")} · {nfmt(num("droppedFictional"))} fictional items and{" "}
          {nfmt(num("droppedNames"))} nameless items dropped during cleaning.
        </p>
        <p className="mt-3 text-[13px]">
          <Link href="/" className="text-turf hover:underline">
            ← Back to the catalogue
          </Link>
        </p>
      </section>
    </div>
  );
}
