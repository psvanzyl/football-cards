"use client";

import { useMemo, useState } from "react";
import { GROUP_ORDER, GROUPS, decadeLabel, flag, nfmt } from "@/lib/format";
import type { Facets, Group, PlayerFilters } from "@/lib/types";

function Section({
  title,
  hint,
  children,
  right,
}: {
  title: string;
  hint?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-line/60 px-4 py-3.5 first:border-t-0">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted">{title}</h3>
        {right}
      </div>
      {hint && <p className="mb-2 text-[11px] leading-snug text-muted/70">{hint}</p>}
      {children}
    </section>
  );
}

function Chip({
  active,
  onClick,
  children,
  className = "",
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
        active
          ? "border-turf bg-turf/15 text-turf"
          : "border-line bg-pitch-850 text-muted hover:border-turf/40 hover:text-fg"
      } ${className}`}
    >
      {children}
    </button>
  );
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1.5 text-[13px] text-fg/90">
      <span>{label}</span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? "bg-turf" : "bg-pitch-600"}`}
      >
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-pitch-950 transition-all ${
            checked ? "left-4.5" : "left-0.5"
          }`}
        />
      </span>
    </label>
  );
}

export function FilterPanel({
  facets,
  filters,
  onPatch,
  onReset,
  teamNames,
  onRemoveTeam,
}: {
  facets: Facets;
  filters: PlayerFilters;
  onPatch: (patch: Partial<PlayerFilters>) => void;
  onReset: () => void;
  teamNames: Record<string, string>;
  onRemoveTeam: (q: string) => void;
}) {
  const [countryQuery, setCountryQuery] = useState("");
  const [showAllCountries, setShowAllCountries] = useState(false);
  const [teamQuery, setTeamQuery] = useState("");
  const [teamHits, setTeamHits] = useState<{ q: string; name: string; players: number; national: boolean }[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);

  const countries = useMemo(() => {
    const q = countryQuery.trim().toLowerCase();
    if (!q) return facets.countries;
    return facets.countries.filter(
      (c) => (c.name ?? "").toLowerCase().includes(q) || (c.iso ?? "").toLowerCase().includes(q),
    );
  }, [facets.countries, countryQuery]);

  const positionsByGroup = useMemo(() => {
    const out = new Map<Group, typeof facets.positions>();
    for (const p of facets.positions) {
      const list = out.get(p.grp) ?? [];
      list.push(p);
      out.set(p.grp, list);
    }
    return out;
  }, [facets.positions]);

  async function searchTeams(v: string) {
    setTeamQuery(v);
    if (v.trim().length < 2) {
      setTeamHits([]);
      return;
    }
    setTeamLoading(true);
    try {
      const r = await fetch(`/api/teams?q=${encodeURIComponent(v)}&limit=8`);
      const j = (await r.json()) as { teams: { q: string; name: string; players: number; national: boolean }[] };
      setTeamHits(j.teams ?? []);
    } catch {
      setTeamHits([]);
    } finally {
      setTeamLoading(false);
    }
  }

  const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const activeCount =
    filters.grp.length +
    filters.pos.length +
    filters.ctry.length +
    filters.team.length +
    filters.decade.length +
    filters.gen.length +
    (filters.active ? 1 : 0) +
    (filters.photo ? 1 : 0) +
    (filters.nat ? 1 : 0);

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-pitch-900/80">
      <div className="flex items-center justify-between gap-2 border-b border-line bg-pitch-850/60 px-4 py-3">
        <h2 className="font-display text-lg uppercase tracking-wide">Filters</h2>
        <button
          type="button"
          onClick={onReset}
          disabled={!activeCount && !filters.q}
          className="rounded-full border border-line px-2.5 py-1 text-[11px] text-muted transition hover:border-flash/50 hover:text-flash disabled:opacity-40"
        >
          reset{activeCount ? ` (${activeCount})` : ""}
        </button>
      </div>

      <Section title="Position">
        <div className="flex flex-wrap gap-1.5">
          {GROUP_ORDER.filter((g) => facets.groups.some((x) => x.key === g)).map((g) => {
            const count = facets.groups.find((x) => x.key === g)?.count ?? 0;
            const active = filters.grp.includes(g);
            return (
              <Chip
                key={g}
                active={active}
                title={GROUPS[g].label}
                onClick={() => onPatch({ grp: toggle(filters.grp, g) })}
                className={active ? `border-current ${GROUPS[g].text}` : ""}
              >
                {GROUPS[g].short}
                <span className="ml-1 text-muted/80">{nfmt(count)}</span>
              </Chip>
            );
          })}
        </div>
        <div className="mt-3 space-y-2">
          {GROUP_ORDER.filter((g) => (positionsByGroup.get(g) ?? []).length > 0).map((g) => (
            <div key={g}>
              <p className={`mb-1 text-[10px] font-bold uppercase tracking-widest ${GROUPS[g].text}`}>
                {GROUPS[g].label}
              </p>
              <div className="flex flex-wrap gap-1">
                {(positionsByGroup.get(g) ?? []).map((p) => (
                  <Chip
                    key={p.name}
                    active={filters.pos.includes(p.name)}
                    onClick={() => onPatch({ pos: toggle(filters.pos, p.name) })}
                  >
                    {p.name}
                    <span className="ml-1 text-muted/70">{nfmt(p.players)}</span>
                  </Chip>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Born in">
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {facets.decades.map((d) => (
            <Chip
              key={d.decade}
              active={filters.decade.includes(d.decade)}
              onClick={() => onPatch({ decade: toggle(filters.decade, d.decade) })}
              className="shrink-0"
            >
              {decadeLabel(d.decade)}
            </Chip>
          ))}
        </div>
      </Section>

      <Section
        title="Country"
        right={
          countries.length > 14 ? (
            <button
              type="button"
              onClick={() => setShowAllCountries((v) => !v)}
              className="text-[11px] text-turf hover:underline"
            >
              {showAllCountries ? "less" : `all ${nfmt(countries.length)}`}
            </button>
          ) : null
        }
      >
        <input
          value={countryQuery}
          onChange={(e) => setCountryQuery(e.target.value)}
          placeholder="Search country…"
          className="mb-2 w-full rounded-lg border border-line bg-pitch-850 px-2.5 py-1.5 text-[13px] outline-none placeholder:text-muted/60 focus:border-turf/60"
        />
        <div className={`no-scrollbar space-y-0.5 ${showAllCountries || countryQuery ? "max-h-64 overflow-y-auto" : ""}`}>
          {(showAllCountries || countryQuery ? countries : countries.slice(0, 14)).map((c) => {
            const active = !!c.iso && filters.ctry.includes(c.iso);
            return (
              <button
                key={c.q}
                type="button"
                disabled={!c.iso}
                onClick={() => c.iso && onPatch({ ctry: toggle(filters.ctry, c.iso) })}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition disabled:opacity-40 ${
                  active ? "bg-turf/15 text-turf" : "hover:bg-pitch-850 text-fg/85"
                }`}
              >
                <span className="text-sm leading-none">{flag(c.iso)}</span>
                <span className="flex-1 truncate">{c.name ?? c.q}</span>
                <span className="text-[11px] text-muted">{nfmt(c.players)}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Club or national team" hint="Type at least two letters to search 26,000+ teams.">
        {filters.team.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {filters.team.map((q) => (
              <span
                key={q}
                className="flex items-center gap-1.5 rounded-full border border-turf/50 bg-turf/15 px-2.5 py-1 text-[11px] text-turf"
              >
                {teamNames[q] ?? q}
                <button type="button" onClick={() => onRemoveTeam(q)} className="text-turf/70 hover:text-fg">
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <input
          value={teamQuery}
          onChange={(e) => void searchTeams(e.target.value)}
          placeholder="e.g. Ajax, Real Madrid…"
          className="w-full rounded-lg border border-line bg-pitch-850 px-2.5 py-1.5 text-[13px] outline-none placeholder:text-muted/60 focus:border-turf/60"
        />
        {teamLoading && <p className="mt-1.5 text-[11px] text-muted">searching…</p>}
        {!teamLoading && teamQuery.trim().length >= 2 && teamHits.length === 0 && (
          <p className="mt-1.5 text-[11px] text-muted">no team matches</p>
        )}
        {teamHits.length > 0 && (
          <div className="mt-1.5 space-y-0.5">
            {teamHits.map((t) => (
              <button
                key={t.q}
                type="button"
                onClick={() => {
                  if (!filters.team.includes(t.q)) onPatch({ team: [...filters.team, t.q] });
                  setTeamQuery("");
                  setTeamHits([]);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-fg/85 transition hover:bg-pitch-850"
              >
                <span className="flex-1 truncate">{t.name}</span>
                {t.national && <span className="text-[10px] uppercase text-flash">nat</span>}
                <span className="text-[11px] text-muted">{nfmt(t.players)}</span>
              </button>
            ))}
          </div>
        )}
      </Section>

      <Section title="Squad">
        <div className="flex flex-wrap gap-1.5">
          <Chip active={filters.gen.length === 0} onClick={() => onPatch({ gen: [] })}>
            Everyone
          </Chip>
          <Chip active={filters.gen.includes("m")} onClick={() => onPatch({ gen: toggle(filters.gen, "m") })}>
            Men
          </Chip>
          <Chip active={filters.gen.includes("f")} onClick={() => onPatch({ gen: toggle(filters.gen, "f") })}>
            Women
          </Chip>
        </div>
      </Section>

      <Section title="Only show">
        <div className="divide-y divide-line/40">
          <Switch label="Still playing" checked={filters.active} onChange={(v) => onPatch({ active: v })} />
          <Switch label="With a photo" checked={filters.photo} onChange={(v) => onPatch({ photo: v })} />
          <Switch label="With a national team" checked={filters.nat} onChange={(v) => onPatch({ nat: v })} />
        </div>
      </Section>
    </div>
  );
}
