import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GROUPS, flag, initials, nfmt, posLabel, span, stat } from "@/lib/format";
import { getTeam, teamSquad, type SquadSort } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ q: string }> }): Promise<Metadata> {
  const { q } = await params;
  const t = getTeam(q);
  if (!t) return { title: "Team not found" };
  return {
    title: `${t.name} — squad & players`,
    description: `Every player recorded at ${t.name}${t.country ? ` (${t.country})` : ""} in the Footballdex catalogue.`,
  };
}

const SQUAD_SORTS: { key: SquadSort; label: string }[] = [
  { key: "apps", label: "Most appearances" },
  { key: "goals", label: "Most goals" },
  { key: "start", label: "Most recent first" },
  { key: "born", label: "Youngest first" },
  { key: "name", label: "Name A→Z" },
];

export default async function TeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ q: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { q } = await params;
  const sp = await searchParams;
  const get = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
  };
  const t = getTeam(q);
  if (!t) notFound();
  const sort = (get("sort") || "apps") as SquadSort;
  const page = Math.max(1, parseInt(get("page") || "1", 10) || 1);
  const { members, total, pages } = teamSquad(t.q, sort, page);
  const link = (patch: Record<string, string>) => {
    const p = new URLSearchParams();
    if (sort !== "apps") p.set("sort", sort);
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const s = p.toString();
    return `/team/${t.q}${s ? `?${s}` : ""}`;
  };

  return (
    <div className="rise">
      <Link href="/teams" className="text-[13px] text-muted transition hover:text-turf">
        ← all teams
      </Link>

      <header className="pitch-glow mt-3 flex flex-col gap-4 rounded-3xl border border-line bg-pitch-900/60 px-5 py-6 sm:flex-row sm:items-center sm:px-7">
        <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-line bg-pitch-850 text-4xl">
          {t.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t.logo} alt="" referrerPolicy="no-referrer" className="h-full w-full object-contain p-2" />
          ) : (
            <span>{flag(t.iso)}</span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-3xl uppercase leading-none sm:text-4xl">{t.name}</h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-muted">
            {t.iso && <span className="text-base leading-none">{flag(t.iso)}</span>}
            {t.country && <span>{t.country}</span>}
            {t.national && <span className="rounded-full bg-flash/15 px-2 py-0.5 text-[10px] uppercase text-flash">national team</span>}
            {t.kind === "national-w" && <span className="rounded-full bg-fwd/15 px-2 py-0.5 text-[10px] uppercase text-fwd">women</span>}
            {t.kind === "national-youth" && <span className="rounded-full bg-def/15 px-2 py-0.5 text-[10px] uppercase text-def">youth</span>}
            {t.inception && <span>· founded {t.inception}</span>}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
            <Link href={`/?team=${t.q}`} className="rounded-full border border-turf/50 bg-turf/10 px-3 py-1 text-turf hover:bg-turf/20">
              Filter the catalogue by this team
            </Link>
            {t.iso && (
              <Link href={`/?ctry=${t.iso}`} className="rounded-full border border-line bg-pitch-850 px-3 py-1 text-fg/85 hover:border-turf/40">
                All players from {t.country ?? t.iso}
              </Link>
            )}
          </div>
        </div>
        <div className="grid shrink-0 grid-cols-3 gap-3 text-center sm:text-right">
          <div>
            <p className="font-display text-2xl leading-none text-turf">{nfmt(total)}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted">players</p>
          </div>
          <div>
            <p className="font-display text-2xl leading-none text-def">{stat(t.apps)}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted">apps</p>
          </div>
          <div>
            <p className="font-display text-2xl leading-none text-fwd">{stat(t.goals)}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted">goals</p>
          </div>
        </div>
      </header>

      <div className="mt-5 flex flex-wrap gap-1.5">
        {SQUAD_SORTS.map((s) => (
          <Link
            key={s.key}
            href={link({ sort: s.key === "apps" ? "" : s.key, page: "" })}
            className={`rounded-full border px-3 py-1.5 text-[12px] transition ${
              sort === s.key
                ? "border-turf bg-turf/15 text-turf"
                : "border-line bg-pitch-900 text-muted hover:border-turf/40 hover:text-fg"
            }`}
          >
            {s.label}
          </Link>
        ))}
      </div>

      {members.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-line bg-pitch-900/60 px-5 py-12 text-center text-[13px] text-muted">
          No players recorded for this team.
        </p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-pitch-900/60">
          {members.map(({ player: p, start, end, apps, goals }) => {
            const m = GROUPS[p.grp];
            return (
              <Link
                key={p.id}
                href={`/player/${p.id}`}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-t border-line/50 px-3.5 py-2.5 transition first:border-t-0 hover:bg-pitch-850/70 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,150px)_auto]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-pitch-850">
                  {p.img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.img} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover object-top" />
                  ) : (
                    <span className="font-display text-sm text-pitch-600">{initials(p.name)}</span>
                  )}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-semibold text-fg/90">{p.name}</span>
                    {end == null && (
                      <span className="shrink-0 rounded-full bg-turf/15 px-1.5 py-0.5 text-[9px] uppercase text-turf">
                        now
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
                    <span className="text-sm leading-none">{flag(p.iso)}</span>
                    <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase ${m.chip}`}>{m.short}</span>
                    <span className="truncate">{posLabel(p.pos, p.grp)}</span>
                  </span>
                </span>
                <span className="hidden text-[12px] text-muted sm:block">{span(start, end, end == null)}</span>
                <span className="flex shrink-0 items-center gap-3 text-[11px] text-muted">
                  <span>
                    <span className="font-semibold text-fg/85">{stat(apps)}</span> apps
                  </span>
                  <span>
                    <span className="font-semibold text-fg/85">{stat(goals)}</span> goals
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {pages > 1 && (
        <div className="mt-5 flex items-center justify-center gap-2 text-[13px]">
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
