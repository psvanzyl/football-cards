import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Football } from "@/components/Ball";
import { CardTile } from "@/components/CardTile";
import { GROUPS, ageOrBorn, flag, height, initials, nfmt, posLabel, span, stat, weight } from "@/lib/format";
import { getFacets, getPlayer, similarPlayers } from "@/lib/queries";

export const dynamic = "force-dynamic";

function refYearOf(): number {
  const g = String(getFacets().stats.generated ?? "");
  return parseInt(g.slice(0, 4), 10) || new Date().getFullYear();
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const p = getPlayer(id);
  if (!p) return { title: "Player not found" };
  const bits = [posLabel(p.pos, p.grp), p.country, p.club].filter(Boolean).join(" · ");
  return {
    title: `${p.name} — ${bits}`,
    description: `Career, position, clubs and national team record for ${p.name}${p.country ? ` (${p.country})` : ""}.`,
  };
}

function Vital({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-pitch-900/70 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-0.5 truncate text-[14px] font-semibold text-fg/90">{value}</p>
    </div>
  );
}

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = getPlayer(id);
  if (!p) notFound();
  const refYear = refYearOf();
  const m = GROUPS[p.grp];
  const similar = similarPlayers(p, 6);
  const ab = ageOrBorn(p.birthYear, refYear, p.open);

  const starts = p.career.map((c) => c.start).filter((x): x is number => x != null);
  const ends = p.career.map((c) => c.end ?? c.start).filter((x): x is number => x != null);
  const minYear = starts.length ? Math.min(...starts) : (p.firstYear ?? 0);
  const maxYear = Math.max(...(ends.length ? ends : [refYear]), p.lastYear ?? 0, minYear + 1);
  const totalSpan = Math.max(1, maxYear - minYear);

  return (
    <div className="rise">
      <Link href="/" className="text-[13px] text-muted transition hover:text-turf">
        ← back to the catalogue
      </Link>

      <div className="mt-3 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-2xl border border-line bg-pitch-900">
          <span className={`block h-1.5 w-full ${m.bar}`} />
          <div className="relative aspect-[4/5] w-full overflow-hidden bg-pitch-850">
            {p.img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.img}
                alt={p.name}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover object-top"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-pitch-800 to-pitch-950">
                <span className="font-display text-7xl text-pitch-600">{initials(p.name)}</span>
              </div>
            )}
            {p.num != null && (
              <span className="absolute right-3 top-3 rounded-xl bg-pitch-950/80 px-2.5 py-1 font-display text-2xl leading-none text-fg/90 backdrop-blur">
                {p.num}
              </span>
            )}
          </div>
          <div className="px-4 py-3.5">
            <div className="flex items-center gap-2">
              <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${m.chip}`}>
                {m.label}
              </span>
              {p.open && (
                <span className="rounded-full bg-turf/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase text-turf">
                  active
                </span>
              )}
            </div>
            <h1 className="mt-2 font-display text-3xl uppercase leading-none text-fg">{p.name}</h1>
            <p className="mt-1.5 flex items-center gap-2 text-[13px] text-muted">
              <span className="text-base leading-none">{flag(p.iso)}</span>
              {p.country ?? "country unrecorded"}
            </p>
            {p.wiki && (
              <a
                href={p.wiki}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-turf hover:underline"
              >
                Wikidata / Wikipedia ↗
              </a>
            )}
          </div>
        </div>

        <div className="min-w-0">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
            <Vital
              label={ab.label === "born" ? "Born" : "Age"}
              value={ab.label === "born" ? String(p.birthYear) : `${ab.value} · born ${p.birthYear}`}
            />
            <Vital label="Position" value={posLabel(p.pos, p.grp)} />
            <Vital label="Height" value={height(p.height)} />
            <Vital label="Weight" value={weight(p.weight)} />
            <Vital label="Appearances" value={stat(p.apps)} />
            <Vital label="Goals" value={stat(p.goals)} />
            <Vital label="National caps" value={stat(p.natCaps)} />
            <Vital label="National goals" value={stat(p.natGoals)} />
          </div>

          {p.positions.length > 1 && (
            <div className="mt-4 rounded-2xl border border-line bg-pitch-900/60 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted">Also plays as</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {p.positions
                  .filter((x) => x !== p.pos)
                  .map((x) => (
                    <span key={x} className="rounded-full border border-line bg-pitch-850 px-2.5 py-1 text-[12px] text-fg/85">
                      {x}
                    </span>
                  ))}
              </div>
            </div>
          )}

          <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
            <div className="rounded-2xl border border-line bg-pitch-900/60 px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-muted">Current club</p>
              <p className="mt-0.5 text-[14px] font-semibold text-fg/90">
                {p.clubQ ? (
                  <Link href={`/team/${p.clubQ}`} className="hover:text-turf">
                    {p.club ?? p.clubQ}
                  </Link>
                ) : (
                  "–"
                )}
              </p>
            </div>
            <div className="rounded-2xl border border-line bg-pitch-900/60 px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-muted">National team</p>
              <p className="mt-0.5 text-[14px] font-semibold text-fg/90">
                {p.natQ ? (
                  <Link href={`/team/${p.natQ}`} className="hover:text-turf">
                    {p.natTeam ?? p.natQ}
                  </Link>
                ) : (
                  "–"
                )}
              </p>
            </div>
            <div className="rounded-2xl border border-line bg-pitch-900/60 px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-muted">Career</p>
              <p className="mt-0.5 text-[14px] font-semibold text-fg/90">
                {span(p.firstYear, p.lastYear, p.open)} · {nfmt(p.clubCount)} teams
              </p>
            </div>
          </div>

          <section className="mt-5">
            <h2 className="mb-2.5 flex items-center gap-2 font-display text-xl uppercase tracking-wide">
              <Football className="h-4 w-4" /> Career
            </h2>
            {p.career.length === 0 ? (
              <p className="rounded-2xl border border-line bg-pitch-900/60 px-4 py-6 text-[13px] text-muted">
                No team history recorded for this player in the source data.
              </p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-line bg-pitch-900/60">
                {p.career.map((c, i) => {
                  const s = c.start ?? minYear;
                  const e = c.end ?? Math.max(maxYear, s);
                  const left = ((s - minYear) / totalSpan) * 100;
                  const width = Math.max(2.5, ((Math.max(e, s) - s) / totalSpan) * 100);
                  return (
                    <div
                      key={`${c.q}-${i}`}
                      className="grid grid-cols-[1fr] items-center gap-2 border-t border-line/50 px-3.5 py-2.5 first:border-t-0 sm:grid-cols-[minmax(140px,220px)_minmax(0,1fr)_auto]"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${c.national ? "bg-flash" : "bg-turf"}`}
                          title={c.national ? "national team" : "club"}
                        />
                        <Link
                          href={`/team/${c.q}`}
                          className="truncate text-[13px] text-fg/90 transition hover:text-turf"
                          title={c.team}
                        >
                          {c.team}
                        </Link>
                      </div>
                      <div className="relative h-5 w-full overflow-hidden rounded-full bg-pitch-850">
                        <span
                          className={`absolute top-0 h-full rounded-full ${
                            c.national ? "bg-flash/45" : "bg-turf/40"
                          }`}
                          style={{ left: `${Math.min(96, Math.max(0, left))}%`, width: `${Math.min(100 - Math.min(96, left), width)}%` }}
                        />
                        <span className="absolute inset-0 flex items-center px-2 text-[10px] text-fg/70">
                          {span(c.start, c.end, c.end == null)}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-3 text-[11px] text-muted">
                        <span title="appearances">
                          <span className="font-semibold text-fg/85">{stat(c.apps)}</span> apps
                        </span>
                        <span title="goals">
                          <span className="font-semibold text-fg/85">{stat(c.goals)}</span> goals
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {similar.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-2.5 font-display text-xl uppercase tracking-wide">
                Other {p.country ?? ""} {m.label.toLowerCase()}s
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {similar.map((s, i) => (
                  <CardTile key={s.id} player={s} refYear={refYear} index={i} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
