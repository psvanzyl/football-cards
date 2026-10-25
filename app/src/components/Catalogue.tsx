"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CardTile } from "./CardTile";
import { FilterPanel } from "./FilterPanel";
import { GROUPS, decadeLabel, flag, nfmt } from "@/lib/format";
import { PER_PAGE, SORTS, countActive, toQuery } from "@/lib/params";
import type { Facets, PlayerFilters, PlayerPage, Sort } from "@/lib/types";

type Props = {
  initial: PlayerPage;
  facets: Facets;
  initialFilters: PlayerFilters;
  initialSort: Sort;
  refYear: number;
};

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function PageButton({
  children,
  onClick,
  active,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`min-w-9 rounded-lg border px-2.5 py-1.5 text-[13px] transition disabled:opacity-35 ${
        active
          ? "border-turf bg-turf/15 font-semibold text-turf"
          : "border-line bg-pitch-900 text-fg/80 hover:border-turf/50 hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

/** Window of page numbers around the current page, with ellipses. */
function pageWindow(page: number, pages: number): (number | "…")[] {
  if (pages <= 9) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(pages - 1, page + 1);
  if (from > 2) out.push("…");
  for (let i = from; i <= to; i++) out.push(i);
  if (to < pages - 1) out.push("…");
  out.push(pages);
  return out;
}

export function Catalogue({ initial, facets, initialFilters, initialSort, refYear }: Props) {
  const [filters, setFilters] = useState<PlayerFilters>(initialFilters);
  const [sort, setSort] = useState<Sort>(initialSort);
  const [page, setPage] = useState(initial.page);
  const [data, setData] = useState<PlayerPage>(initial);
  const [loading, setLoading] = useState(false);
  const [teamNames, setTeamNames] = useState<Record<string, string>>({});
  const [qText, setQText] = useState(initialFilters.q);
  const [showPanel, setShowPanel] = useState(false);
  const debouncedQ = useDebounced(qText, 350);
  const first = useRef(true);

  // Keep the search box in sync when the query is changed elsewhere (chips, reset).
  useEffect(() => {
    setQText(filters.q);
  }, [filters.q]);

  useEffect(() => {
    if (filters.q === debouncedQ) return;
    setFilters((f) => ({ ...f, q: debouncedQ }));
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ]);

  const qs = useMemo(() => toQuery(filters, sort, page, PER_PAGE), [filters, sort, page]);

  useEffect(() => {
    // The server already rendered this exact state; only fetch on real changes.
    if (first.current) {
      first.current = false;
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/players?${qs}`)
      .then((r) => r.json() as Promise<PlayerPage>)
      .then((j) => {
        if (!cancelled) setData(j);
      })
      .catch(() => {
        /* keep the previous page on a failed fetch */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    if (typeof window !== "undefined") {
      const url = qs ? `/?${qs}` : "/";
      window.history.replaceState(null, "", url);
    }
    return () => {
      cancelled = true;
    };
  }, [qs]);

  const patch = useCallback((p: Partial<PlayerFilters>) => {
    setFilters((f) => ({ ...f, ...p }));
    setPage(1);
  }, []);

  const reset = useCallback(() => {
    setFilters({
      q: "",
      grp: [],
      pos: [],
      ctry: [],
      team: [],
      decade: [],
      gen: [],
      active: false,
      photo: false,
      nat: false,
    });
    setSort({ key: "name", dir: "asc" });
    setPage(1);
  }, []);

  const countryName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of facets.countries) if (c.iso) m.set(c.iso, c.name ?? c.iso);
    return m;
  }, [facets.countries]);

  const chips: { key: string; label: string; remove: () => void }[] = [];
  for (const g of filters.grp)
    chips.push({ key: `grp-${g}`, label: GROUPS[g].short, remove: () => patch({ grp: filters.grp.filter((x) => x !== g) }) });
  for (const p of filters.pos)
    chips.push({ key: `pos-${p}`, label: p, remove: () => patch({ pos: filters.pos.filter((x) => x !== p) }) });
  for (const c of filters.ctry)
    chips.push({
      key: `ctry-${c}`,
      label: `${flag(c)} ${countryName.get(c) ?? c}`,
      remove: () => patch({ ctry: filters.ctry.filter((x) => x !== c) }),
    });
  for (const t of filters.team)
    chips.push({
      key: `team-${t}`,
      label: teamNames[t] ?? t,
      remove: () => patch({ team: filters.team.filter((x) => x !== t) }),
    });
  for (const d of filters.decade)
    chips.push({
      key: `decade-${d}`,
      label: decadeLabel(d),
      remove: () => patch({ decade: filters.decade.filter((x) => x !== d) }),
    });
  for (const g of filters.gen)
    chips.push({ key: `gen-${g}`, label: g === "f" ? "Women" : "Men", remove: () => patch({ gen: filters.gen.filter((x) => x !== g) }) });
  if (filters.active) chips.push({ key: "active", label: "Still playing", remove: () => patch({ active: false }) });
  if (filters.photo) chips.push({ key: "photo", label: "With photo", remove: () => patch({ photo: false }) });
  if (filters.nat) chips.push({ key: "nat", label: "National team", remove: () => patch({ nat: false }) });

  const sortMeta = SORTS.find((s) => s.key === sort.key) ?? SORTS[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[290px_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
        <button
          type="button"
          onClick={() => setShowPanel((v) => !v)}
          className="mb-3 flex w-full items-center justify-between rounded-xl border border-line bg-pitch-900 px-4 py-2.5 text-[13px] lg:hidden"
        >
          <span className="font-display text-base uppercase tracking-wide">Filters</span>
          <span className="text-muted">
            {countActive(filters) ? `${countActive(filters)} active · ` : ""}
            {showPanel ? "hide" : "show"}
          </span>
        </button>
        <div className={showPanel ? "" : "hidden lg:block"}>
          <FilterPanel
            facets={facets}
            filters={filters}
            onPatch={patch}
            onReset={reset}
            teamNames={teamNames}
            onRemoveTeam={(q) => patch({ team: filters.team.filter((x) => x !== q) })}
          />
        </div>
      </aside>

      <div className="min-w-0">
        <div className="rounded-2xl border border-line bg-pitch-900/70 p-3.5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">⌕</span>
              <input
                value={qText}
                onChange={(e) => setQText(e.target.value)}
                placeholder={`Search ${nfmt(Number(facets.stats.players ?? 0))} players by name…`}
                className="w-full rounded-xl border border-line bg-pitch-850 py-2.5 pl-9 pr-3 text-[15px] outline-none placeholder:text-muted/60 focus:border-turf/60"
                aria-label="Search players"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={sort.key}
                onChange={(e) => {
                  const meta = SORTS.find((s) => s.key === e.target.value) ?? SORTS[0];
                  setSort({ key: meta.key, dir: meta.dir });
                  setPage(1);
                }}
                className="rounded-xl border border-line bg-pitch-850 px-2.5 py-2.5 text-[13px] outline-none focus:border-turf/60"
                aria-label="Sort by"
              >
                {SORTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    Sort: {s.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                title={sort.dir === "desc" ? "Descending — click for ascending" : "Ascending — click for descending"}
                onClick={() => {
                  setSort((s) => ({ ...s, dir: s.dir === "desc" ? "asc" : "desc" }));
                  setPage(1);
                }}
                className="rounded-xl border border-line bg-pitch-850 px-3 py-2.5 text-[13px] text-fg/85 transition hover:border-turf/50"
              >
                {sort.dir === "desc" ? "↓" : "↑"}
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-muted">
            <span className={`${loading ? "animate-pulse" : ""} font-medium text-fg/85`}>
              {nfmt(data.total)} {data.total === 1 ? "player" : "players"}
            </span>
            <span className="text-muted/50">·</span>
            <span title={sortMeta.hint}>
              sorted by {sortMeta.label.toLowerCase()} {sort.dir === "desc" ? "↓" : "↑"}
            </span>
            {data.pages > 1 && (
              <>
                <span className="text-muted/50">·</span>
                <span>
                  page {nfmt(data.page)} of {nfmt(data.pages)}
                </span>
              </>
            )}
            {chips.length > 0 && (
              <button type="button" onClick={reset} className="ml-auto text-turf hover:underline">
                clear all
              </button>
            )}
          </div>

          {chips.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={c.remove}
                  className="flex items-center gap-1.5 rounded-full border border-turf/40 bg-turf/10 px-2.5 py-1 text-[11px] text-turf transition hover:border-flash/60 hover:text-flash"
                >
                  {c.label}
                  <span className="text-turf/70">×</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {data.dbMissing && (
          <p className="mt-4 rounded-xl border border-flash/40 bg-flash/10 px-4 py-3 text-[13px] text-flash">
            The catalogue database is not mounted on this container. Nothing can be queried until
            <code className="mx-1 rounded bg-pitch-950 px-1">catalogue.sqlite</code>
            is present in the data volume.
          </p>
        )}

        {data.players.length === 0 && !data.dbMissing ? (
          <div className="mt-6 rounded-2xl border border-line bg-pitch-900/60 px-6 py-14 text-center">
            <p className="font-display text-2xl text-fg/90">No players match those filters</p>
            <p className="mt-1 text-[13px] text-muted">
              Try removing a filter — coverage of positions, heights and appearance records is uneven in the
              source data.
            </p>
            <button
              type="button"
              onClick={reset}
              className="mt-4 rounded-full border border-turf/50 px-4 py-1.5 text-[13px] text-turf hover:bg-turf/10"
            >
              Reset filters
            </button>
          </div>
        ) : (
          <div
            className={`mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 ${
              loading ? "opacity-60" : ""
            }`}
          >
            {data.players.map((p, i) => (
              <CardTile key={p.id} player={p} refYear={refYear} index={i} />
            ))}
          </div>
        )}

        {data.pages > 1 && (
          <div className="mt-7 flex flex-wrap items-center justify-center gap-1.5">
            <PageButton onClick={() => setPage(Math.max(1, data.page - 1))} disabled={data.page <= 1} title="Previous page">
              ←
            </PageButton>
            {pageWindow(data.page, data.pages).map((p, i) =>
              p === "…" ? (
                <span key={`e${i}`} className="px-1 text-muted">
                  …
                </span>
              ) : (
                <PageButton
                  key={p}
                  active={p === data.page}
                  onClick={() => {
                    setPage(p);
                    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  {p}
                </PageButton>
              ),
            )}
            <PageButton
              onClick={() => setPage(Math.min(data.pages, data.page + 1))}
              disabled={data.page >= data.pages}
              title="Next page"
            >
              →
            </PageButton>
          </div>
        )}
      </div>
    </div>
  );
}
