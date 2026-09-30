"use client";

import { AnimatePresence, motion } from "motion/react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { CITIES, SOURCES, type SourceKey } from "@/lib/config";
import type { ListingView, SourceStatus } from "@/lib/data";
import { ilsShort, isFresh, relativeTime } from "@/lib/format";
import { Chip, Segmented, Select, Toggle } from "./controls";
import { ListingCard, ListingRow } from "./listing-card";
import { Logo } from "./logo";

type Sort = "priority" | "newest" | "price-asc" | "price-desc" | "sqm-price";
type PriceBand = "any" | "lt3" | "3to375" | "gt375";
type Rooms = "any" | "4" | "4.5" | "5";

const PRICE_BANDS: Record<PriceBand, [number, number]> = {
  any: [0, Infinity],
  lt3: [0, 3_000_000],
  "3to375": [3_000_000, 3_750_000],
  gt375: [3_750_000, Infinity],
};

const PAGE = 48;

const postedTime = (l: ListingView) => new Date(l.postedAt ?? l.firstSeenAt).getTime();

function sortListings(list: ListingView[], sort: Sort) {
  const byNewest = (a: ListingView, b: ListingView) => postedTime(b) - postedTime(a);
  const priceOr = (l: ListingView, fallback: number) => l.price ?? fallback;
  const perSqm = (l: ListingView) => (l.price && l.sqm ? l.price / l.sqm : Infinity);
  const sorted = [...list];
  switch (sort) {
    case "priority":
      return sorted.sort((a, b) => a.priority - b.priority || byNewest(a, b));
    case "newest":
      return sorted.sort(byNewest);
    case "price-asc":
      return sorted.sort((a, b) => priceOr(a, Infinity) - priceOr(b, Infinity));
    case "price-desc":
      return sorted.sort((a, b) => priceOr(b, 0) - priceOr(a, 0));
    case "sqm-price":
      return sorted.sort((a, b) => perSqm(a) - perSqm(b));
  }
}

function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export function Dashboard({ listings, status, now }: { listings: ListingView[]; status: SourceStatus[]; now: number }) {
  const [priority, setPriority] = useState<number>(0);
  const [cities, setCities] = useState<Set<string>>(new Set());
  const [sources, setSources] = useState<Set<string>>(new Set());
  const [price, setPrice] = useState<PriceBand>("any");
  const [rooms, setRooms] = useState<Rooms>("any");
  const [sort, setSort] = useState<Sort>("priority");
  const [onlyNew, setOnlyNew] = useState(false);
  const [onlyPrivate, setOnlyPrivate] = useState(false);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [limit, setLimit] = useState(PAGE);
  const q = useDeferredValue(query.trim().toLowerCase());

  const presentSources = useMemo(
    () => (Object.keys(SOURCES) as SourceKey[]).filter((s) => listings.some((l) => l.source === s)),
    [listings],
  );

  const filtered = useMemo(() => {
    const [lo, hi] = PRICE_BANDS[price];
    const out = listings.filter(
      (l) =>
        (!priority || l.priority === priority) &&
        (!cities.size || cities.has(l.city)) &&
        (!sources.size || sources.has(l.source)) &&
        (price === "any" || (l.price != null && l.price >= lo && l.price < hi)) &&
        (rooms === "any" || l.rooms === Number(rooms)) &&
        (!onlyNew || isFresh(l.firstSeenAt, 24, now)) &&
        (!onlyPrivate || l.isAgency === false) &&
        (!q || [l.street, l.neighborhood, l.title, l.description].some((f) => f?.toLowerCase().includes(q))),
    );
    return sortListings(out, sort);
  }, [listings, priority, cities, sources, price, rooms, sort, onlyNew, onlyPrivate, q, now]);

  const stats = useMemo(() => {
    const fresh = listings.filter((l) => isFresh(l.firstSeenAt, 24, now)).length;
    const drops = listings.filter((l) => l.previousPrice && l.price && l.price < l.previousPrice).length;
    const perSqm = median(filtered.filter((l) => l.price && l.sqm).map((l) => l.price! / l.sqm!));
    return { fresh, drops, perSqm, medianPrice: median(filtered.flatMap((l) => (l.price ? [l.price] : []))) };
  }, [listings, filtered, now]);

  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const l of listings) c.set(l.city, (c.get(l.city) ?? 0) + 1);
    return c;
  }, [listings]);

  const toggleIn = (set: Set<string>, v: string, apply: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    apply(next);
    setLimit(PAGE);
  };

  const activeFilters =
    (priority ? 1 : 0) + cities.size + sources.size + (price !== "any" ? 1 : 0) + (rooms !== "any" ? 1 : 0) + (onlyNew ? 1 : 0) + (onlyPrivate ? 1 : 0) + (q ? 1 : 0);

  const reset = () => {
    setPriority(0);
    setCities(new Set());
    setSources(new Set());
    setPrice("any");
    setRooms("any");
    setOnlyNew(false);
    setOnlyPrivate(false);
    setQuery("");
    setLimit(PAGE);
  };

  const visible = filtered.slice(0, limit);
  const lastRun = status.reduce<string | null>((max, s) => (s.finishedAt && (!max || s.finishedAt > max) ? s.finishedAt : max), null);

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-30 border-b border-border/80 bg-bg/80 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-14 max-w-[1320px] items-center justify-between px-4 sm:px-6">
          <Logo />
          <StatusPill status={status} lastRun={lastRun} now={now} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 pb-24 sm:px-6">
        <section className="pt-10 pb-8 sm:pt-14">
          <h1 className="max-w-2xl text-[32px] font-semibold leading-[1.1] tracking-[-0.035em] text-balance sm:text-[40px]">
            Every 4–5 room flat between ₪2M and ₪4.5M, <span className="text-muted">in one place.</span>
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
            Collected from Yad2, Madlan, OnMap, Homeless and Facebook groups every 8 hours, ranked by where you want to live.
          </p>

          <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-4">
            <Stat label="Tracked listings" value={listings.length.toLocaleString("en-US")} />
            <Stat label="New in 24h" value={stats.fresh.toLocaleString("en-US")} accent={stats.fresh > 0} />
            <Stat label="Median price" value={ilsShort(stats.medianPrice)} hint="current filter" />
            <Stat label="Median ₪/m²" value={stats.perSqm ? `₪${Math.round(stats.perSqm).toLocaleString("en-US")}` : "—"} hint="current filter" />
          </dl>
        </section>

        {/* Filters */}
        <div className="sticky top-14 z-20 -mx-4 border-b border-border/70 bg-bg/85 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6">
          <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Segmented
              id="priority"
              value={priority}
              onChange={(v) => {
                setPriority(v);
                setLimit(PAGE);
              }}
              options={[
                { value: 0, label: "All" },
                { value: 1, label: "Top" },
                { value: 2, label: "High" },
                { value: 3, label: "Medium" },
                { value: 4, label: "Low" },
              ]}
            />
            <div className="mx-1 h-5 w-px shrink-0 bg-border" />
            {CITIES.map((c) => (
              <Chip
                key={c.key}
                active={cities.has(c.key)}
                dotColor={`var(--p${c.priority})`}
                onClick={() => toggleIn(cities, c.key, setCities)}
              >
                {c.name}
                <span className="tabular opacity-60">{counts.get(c.key) ?? 0}</span>
              </Chip>
            ))}
          </div>

          <div className="mt-2.5 flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <label className="relative flex h-9 w-56 shrink-0 items-center rounded-[10px] border border-border bg-surface transition-colors focus-within:border-accent hover:border-border-strong">
              <svg className="absolute left-3 size-3.5 text-faint" viewBox="0 0 16 16" fill="none">
                <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.6" />
                <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLimit(PAGE);
                }}
                placeholder="Street or neighborhood"
                dir="auto"
                className="size-full bg-transparent pl-8 pr-3 text-[13px] outline-none placeholder:text-faint"
              />
            </label>
            <Select
              label="Price"
              value={price}
              onChange={(v) => {
                setPrice(v);
                setLimit(PAGE);
              }}
              options={[
                { value: "any", label: "Any" },
                { value: "lt3", label: "Under ₪3M" },
                { value: "3to375", label: "₪3M – ₪3.75M" },
                { value: "gt375", label: "₪3.75M+" },
              ]}
            />
            <Select
              label="Rooms"
              value={rooms}
              onChange={(v) => {
                setRooms(v);
                setLimit(PAGE);
              }}
              options={[
                { value: "any", label: "Any" },
                { value: "4", label: "4" },
                { value: "4.5", label: "4.5" },
                { value: "5", label: "5" },
              ]}
            />
            <Select
              label="Source"
              value={sources.size === 1 ? [...sources][0] : "all"}
              onChange={(v) => {
                setSources(v === "all" ? new Set() : new Set([v]));
                setLimit(PAGE);
              }}
              options={[{ value: "all", label: "All" }, ...presentSources.map((s) => ({ value: s, label: SOURCES[s].name }))]}
            />
            <Toggle on={onlyNew} onChange={setOnlyNew}>
              New
            </Toggle>
            <Toggle on={onlyPrivate} onChange={setOnlyPrivate}>
              No agents
            </Toggle>
            <div className="ml-auto flex shrink-0 items-center gap-2 pl-2">
              <Select
                label="Sort"
                value={sort}
                onChange={setSort}
                options={[
                  { value: "priority", label: "Priority" },
                  { value: "newest", label: "Newest" },
                  { value: "price-asc", label: "Price ↑" },
                  { value: "price-desc", label: "Price ↓" },
                  { value: "sqm-price", label: "₪/m² ↑" },
                ]}
              />
              <Segmented
                id="view"
                value={view}
                onChange={setView}
                options={[
                  { value: "grid", label: <GridIcon /> },
                  { value: "list", label: <ListIcon /> },
                ]}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between py-5 text-[13px] text-muted">
          <span className="tabular">
            <span className="font-medium text-fg">{filtered.length.toLocaleString("en-US")}</span> listing{filtered.length === 1 ? "" : "s"}
            {stats.drops > 0 && <span> · {stats.drops} price drops</span>}
          </span>
          <AnimatePresence>
            {activeFilters > 0 && (
              <motion.button
                initial={{ opacity: 0, x: 6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 6 }}
                transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
                onClick={reset}
                className="font-medium text-muted transition-colors hover:text-fg active:scale-[0.97]"
              >
                Clear {activeFilters} filter{activeFilters === 1 ? "" : "s"}
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {filtered.length === 0 ? (
          <EmptyState hasData={listings.length > 0} onReset={reset} />
        ) : view === "grid" ? (
          <motion.ul layout className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <AnimatePresence mode="popLayout" initial={false}>
              {visible.map((l, i) => (
                <motion.li
                  key={l.id}
                  layout="position"
                  initial={{ opacity: 0, scale: 0.97, y: 6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1], delay: Math.min(i % PAGE, 12) * 0.018 }}
                >
                  <ListingCard l={l} now={now} />
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            {visible.map((l) => (
              <ListingRow key={l.id} l={l} now={now} />
            ))}
          </div>
        )}

        {filtered.length > limit && (
          <div className="mt-10 flex justify-center">
            <button
              onClick={() => setLimit((n) => n + PAGE)}
              className="h-10 rounded-full border border-border bg-surface px-5 text-[13px] font-medium text-fg shadow-[var(--shadow-card)] transition-[transform,border-color] duration-150 hover:border-border-strong active:scale-[0.97]"
            >
              Show {Math.min(PAGE, filtered.length - limit)} more
              <span className="ml-1.5 text-muted tabular">of {filtered.length - limit}</span>
            </button>
          </div>
        )}
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[1320px] items-center justify-between px-4 py-6 text-[12px] text-faint sm:px-6">
          <span>diraBot · runs every 8 hours</span>
          <span>Last update {relativeTime(lastRun, now)}</span>
        </div>
      </footer>
    </div>
  );
}

function Stat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className="bg-surface px-5 py-4">
      <dt className="text-[12px] font-medium text-muted">
        {label}
        {hint && <span className="ml-1 font-normal text-faint">· {hint}</span>}
      </dt>
      <dd className={`mt-1 text-[24px] font-semibold tracking-[-0.03em] tabular ${accent ? "text-accent" : ""}`}>{value}</dd>
    </div>
  );
}

const STATUS_COLOR: Record<string, string> = {
  ok: "var(--p1)",
  skipped: "var(--faint)",
  blocked: "#d97706",
  error: "#dc2626",
};

function StatusPill({ status, lastRun, now }: { status: SourceStatus[]; lastRun: string | null; now: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const healthy = status.filter((s) => s.status === "ok").length;
  const problems = status.some((s) => s.status === "blocked" || s.status === "error");

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex h-8 items-center gap-2 rounded-full border border-border bg-surface px-3 text-[12px] font-medium text-muted transition-[border-color,color,transform] duration-150 hover:border-border-strong hover:text-fg active:scale-[0.97]"
      >
        <span className="relative flex size-2">
          <span
            className="absolute inset-0 animate-ping rounded-full opacity-40"
            style={{ background: problems ? STATUS_COLOR.blocked : STATUS_COLOR.ok }}
          />
          <span className="relative size-2 rounded-full" style={{ background: problems ? STATUS_COLOR.blocked : STATUS_COLOR.ok }} />
        </span>
        <span className="hidden sm:inline">Updated</span> {relativeTime(lastRun, now)}
        <span className="text-faint tabular">
          · {healthy}/{status.length}
        </span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
            style={{ transformOrigin: "top right" }}
            className="absolute right-0 top-10 w-[320px] rounded-xl border border-border bg-surface p-1.5 shadow-[var(--shadow-lift)]"
          >
            <div className="px-2.5 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Sources · last run</div>
            {status.length === 0 && <div className="px-2.5 py-2 text-[13px] text-muted">No runs yet.</div>}
            {status.map((s) => (
              <div key={s.source} className="flex items-start gap-2.5 rounded-lg px-2.5 py-2 hover:bg-surface-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ background: STATUS_COLOR[s.status] ?? "var(--faint)" }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2 text-[13px]">
                    <span className="font-medium">{SOURCES[s.source as SourceKey]?.name ?? s.source}</span>
                    <span className="text-[12px] text-faint">{relativeTime(s.finishedAt, now)}</span>
                  </div>
                  <div className="truncate text-[12px] text-muted" title={s.message ?? undefined}>
                    {s.status === "ok" ? `${s.found} matching · ${s.inserted} new` : s.status === "skipped" ? s.message : `${s.status}: ${s.message ?? ""}`}
                  </div>
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function EmptyState({ hasData, onReset }: { hasData: boolean; onReset: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-border-strong px-6 py-20 text-center">
      <div className="blueprint mb-5 grid size-14 place-items-center rounded-2xl text-faint">
        <svg viewBox="0 0 24 24" className="size-6" fill="none">
          <path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      </div>
      <h2 className="text-[15px] font-semibold">{hasData ? "Nothing matches these filters" : "No listings yet"}</h2>
      <p className="mt-1 max-w-sm text-[13px] text-muted">
        {hasData ? "Try widening the price band or clearing a city." : "The first scrape runs on the next 8-hour slot. Listings will appear here."}
      </p>
      {hasData && (
        <button onClick={onReset} className="mt-5 h-9 rounded-full bg-fg px-4 text-[13px] font-medium text-bg transition-transform active:scale-[0.97]">
          Clear filters
        </button>
      )}
    </div>
  );
}

function GridIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-label="Grid view">
      <rect x="2" y="2" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="9" y="2" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2" y="9" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="9" y="9" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-label="List view">
      <path d="M2.5 4h11M2.5 8h11M2.5 12h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
