import Link from "next/link";
import { GROUPS, ageOrBorn, flag, initials, posLabel, stat } from "@/lib/format";
import type { CardPlayer } from "@/lib/types";

function Cell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col-reverse">
      <dt className="truncate text-[9px] uppercase tracking-wider text-muted/70">{label}</dt>
      <dd
        className={`truncate text-[13px] font-semibold leading-tight tabular-nums ${
          accent ? "text-flash" : "text-fg/90"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * One player card. Cards are deliberately compact: the photograph (or the initials
 * watermark that stands in for it) carries the top half, then name, role and the four
 * numbers a football reader looks for. Anything else lives on the player page.
 */
export function CardTile({
  player: p,
  refYear,
  index = 0,
}: {
  player: CardPlayer;
  refYear: number;
  index?: number;
}) {
  const m = GROUPS[p.grp];
  const role = posLabel(p.pos, p.grp);
  const club = p.club ?? null;
  const ab = ageOrBorn(p.birthYear, refYear, p.open);
  return (
    <Link
      href={`/player/${p.id}`}
      title={p.name}
      className="rise card-shadow group relative flex flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-turf/50 hover:bg-pitch-850 focus-visible:outline focus-visible:outline-2 focus-visible:outline-turf"
      style={{ animationDelay: `${Math.min(index, 24) * 16}ms` }}
    >
      <span className={`h-1 w-full ${m.bar}`} />
      <div className="flex items-center justify-between gap-2 px-3 pt-2">
        <span className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted">
          <span className="text-sm leading-none">{flag(p.iso)}</span>
          {p.iso ? p.iso.toUpperCase() : "—"}
        </span>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${m.chip}`}>
          {m.short}
        </span>
      </div>

      <div className="relative mt-2 aspect-[4/5] w-full overflow-hidden bg-gradient-to-br from-pitch-800 to-pitch-950">
        {/* The monogram is drawn first and the photograph sits on top of it: it covers the
            card while a photo is still loading, and it is the whole picture for the ~83%
            of players Wikidata has no photograph for. */}
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
          <span className="pointer-events-none absolute -bottom-7 -right-4 select-none text-[112px] leading-none opacity-[0.16]">
            {flag(p.iso)}
          </span>
          <span className="relative flex h-[72px] w-[72px] items-center justify-center rounded-full border-2 border-pitch-600/80 bg-pitch-900/70 font-display text-[30px] leading-none tracking-wider text-turf/75">
            {initials(p.name)}
          </span>
        </div>
        {p.img && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.img}
            alt={p.name}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="relative h-full w-full object-cover object-top transition duration-300 group-hover:scale-[1.03]"
          />
        )}
        {p.num != null && (
          <span className="absolute right-2 top-2 rounded-lg bg-pitch-950/80 px-1.5 py-0.5 font-display text-lg leading-none text-fg/90 backdrop-blur">
            {p.num}
          </span>
        )}
        {p.open && (
          <span className="absolute left-2 top-2 rounded-full bg-pitch-950/75 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-turf backdrop-blur">
            active
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col px-3 pb-2.5 pt-2">
        <h3 className="line-clamp-2 min-h-[2.3em] font-display text-[16px] leading-[1.15] text-fg group-hover:text-turf">
          {p.name}
        </h3>
        <p className="mt-1 truncate text-xs text-muted">
          {role}
          {club ? ` · ${club}` : ""}
        </p>
        <dl className="mt-2 grid grid-cols-4 gap-1.5 border-t border-line/70 pt-2">
          <Cell label={ab.label} value={ab.value} />
          <Cell label="apps" value={stat(p.apps)} />
          <Cell label="goals" value={stat(p.goals)} accent={p.goals != null && p.goals > 0} />
          <Cell label="caps" value={stat(p.natCaps)} />
        </dl>
      </div>
    </Link>
  );
}
