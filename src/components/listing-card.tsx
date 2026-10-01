"use client";

import { memo, useState } from "react";
import { CITY_BY_KEY, PRIORITY_LABEL, SOURCES, type CityKey, type Priority, type SourceKey } from "@/lib/config";
import type { ListingView } from "@/lib/data";
import { ils, ilsShort, isFresh, relativeTime } from "@/lib/format";
import { LogoMark } from "./logo";

export const priorityVars = (p: number) => ({
  color: `var(--p${p})`,
  background: `var(--p${p}-soft)`,
});

export function PriorityBadge({ p, withCity, size = "md" }: { p: number; withCity?: string; size?: "sm" | "md" }) {
  return (
    <span
      className={`inline-flex w-fit shrink-0 items-center justify-self-start whitespace-nowrap rounded-full font-semibold tracking-[0.01em] ${
        size === "sm" ? "h-5 gap-[5px] px-1.5 text-[10.5px]" : "h-[22px] gap-1 px-2 text-[11px]"
      }`}
      style={priorityVars(p)}
    >
      <span className={`${size === "sm" ? "size-[5px]" : "size-1.5"} rounded-full bg-current`} />
      {PRIORITY_LABEL[p as Priority]}
      {withCity && <span className="font-medium opacity-80">· {withCity}</span>}
    </span>
  );
}

const sourceName = (s: string) => SOURCES[s as SourceKey]?.name ?? s;
const cityName = (c: string) => CITY_BY_KEY[c as CityKey]?.name ?? c;

function facts(l: ListingView) {
  return [
    l.rooms != null ? `${l.rooms} rooms` : null,
    l.sqm ? `${l.sqm} m²` : null,
    l.floor != null ? (l.floor === 0 ? "ground floor" : `floor ${l.floor}`) : null,
  ].filter(Boolean) as string[];
}

function placeLine(l: ListingView) {
  return [l.street, l.neighborhood].filter(Boolean).join(", ") || l.title || "";
}

/** Madlan can't be checked directly, so its removals rest on a long absence: a weaker signal. */
function removedLabel(l: ListingView, now: number) {
  return `${l.source === "madlan" ? "Likely removed" : "Removed"} · ${relativeTime(l.removedAt, now)}`;
}
const removedHint = (l: ListingView) =>
  l.source === "madlan" ? "Not seen on Madlan for 3+ weeks" : `The ad's page on ${sourceName(l.source)} says it was taken down`;

function PriceDrop({ l }: { l: ListingView }) {
  if (!l.previousPrice || !l.price || l.price >= l.previousPrice) return null;
  return (
    <span className="inline-flex items-center gap-0.5 rounded-md bg-[var(--p1-soft)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--drop)] tabular">
      ↓ {ilsShort(l.previousPrice - l.price)}
    </span>
  );
}

/** Memoized: the grid re-renders on every hover/filter tick, cards only when their own props change. */
export const ListingCard = memo(function ListingCard({
  l,
  now,
  onHover,
  highlighted = false,
}: {
  l: ListingView;
  now: number;
  /** Reports pointer enter/leave (id / null), e.g. to light up the matching map pin. */
  onHover?: (id: number | null) => void;
  /** Accent ring, e.g. when the listing's map pin is hovered or selected. */
  highlighted?: boolean;
}) {
  const [imgOk, setImgOk] = useState(!!l.image);
  const perSqm = l.price && l.sqm ? Math.round(l.price / l.sqm) : null;
  const place = placeLine(l);
  const fresh = isFresh(l.firstSeenAt, 24, now);
  const removed = !!l.removedAt;

  return (
    <a
      href={l.url}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={onHover && (() => onHover(l.id))}
      onMouseLeave={onHover && (() => onHover(null))}
      className={`group flex h-full flex-col overflow-hidden rounded-2xl border bg-surface outline-none transition-[translate,scale,box-shadow,border-color,opacity] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)] focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.99] ${
        highlighted
          ? "-translate-y-0.5 border-accent shadow-[var(--shadow-lift)] ring-1 ring-accent"
          : "border-border shadow-[var(--shadow-card)] hover:border-border-strong"
      } ${removed ? "opacity-70 hover:opacity-100 focus-visible:opacity-100" : ""}`}
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        {imgOk ? (
          // Remote images come from many CDNs; a plain img avoids per-host config.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={l.image!}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgOk(false)}
            className={`size-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:scale-[1.03] ${removed ? "grayscale" : ""}`}
          />
        ) : (
          <div className="blueprint grid size-full place-items-center text-faint">
            <LogoMark size={34} className="opacity-50" />
          </div>
        )}
        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-2.5">
          <PriorityBadge p={l.priority} withCity={cityName(l.city)} />
          <span className="rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-md">
            {sourceName(l.source)}
          </span>
        </div>
        {removed ? (
          <span
            title={removedHint(l)}
            className="absolute bottom-2.5 left-2.5 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-md"
          >
            {removedLabel(l, now)}
          </span>
        ) : fresh && (
          <span className="absolute bottom-2.5 left-2.5 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-fg shadow-sm">
            New
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[20px] font-semibold tracking-[-0.02em] tabular">{ils(l.price)}</span>
          {perSqm && <span className="text-[12px] text-muted tabular">{ilsShort(perSqm)}/m²</span>}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
          {facts(l).map((f, i) => (
            <span key={f} className="inline-flex items-center gap-2">
              {i > 0 && <span className="size-[3px] rounded-full bg-faint" />}
              {f}
            </span>
          ))}
          <PriceDrop l={l} />
        </div>
        {place && (
          <p dir="auto" className="line-clamp-1 text-[13px] text-fg/80">
            {place}
          </p>
        )}
        <div className="mt-auto flex items-center justify-between pt-3 text-[12px] text-faint">
          <span>
            {l.postedAt ? `Posted ${relativeTime(l.postedAt, now)}` : `Found ${relativeTime(l.firstSeenAt, now)}`}
            {l.isAgency === false && <span className="ml-1.5 text-muted">· Private</span>}
            {l.alsoOn.length > 0 && (
              <span className="ml-1.5 text-muted">· also on {[...new Set(l.alsoOn.map((a) => sourceName(a.source)))].join(", ")}</span>
            )}
          </span>
          <span className="inline-flex items-center gap-1 font-medium text-muted transition-colors group-hover:text-accent">
            Open
            <svg className="size-3 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" viewBox="0 0 12 12" fill="none">
              <path d="M3.5 8.5 8.5 3.5M4.5 3.5h4v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
      </div>
    </a>
  );
});

export function ListingRow({ l, now }: { l: ListingView; now: number }) {
  const perSqm = l.price && l.sqm ? Math.round(l.price / l.sqm) : null;
  const removed = !!l.removedAt;
  return (
    <a
      href={l.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`group grid grid-cols-[68px_1fr_auto] items-center gap-x-4 gap-y-1 border-b border-border px-4 py-3 transition-[background-color,opacity] duration-150 last:border-b-0 hover:bg-surface-2 md:grid-cols-[68px_130px_150px_1fr_110px_90px_20px] ${
        removed ? "opacity-70 hover:opacity-100 focus-visible:opacity-100" : ""
      }`}
    >
      <PriorityBadge p={l.priority} size="sm" />
      <span className="text-[15px] font-semibold tracking-[-0.01em] tabular md:order-none">{ils(l.price)}</span>
      {removed && (
        <span title={removedHint(l)} className="whitespace-nowrap rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted md:hidden">
          {removedLabel(l, now)}
        </span>
      )}
      <span className="hidden text-[13px] text-muted tabular md:block">
        {[l.rooms != null ? `${l.rooms} r` : null, l.sqm ? `${l.sqm} m²` : null, perSqm ? `${ilsShort(perSqm)}/m²` : null]
          .filter(Boolean)
          .join(" · ")}
      </span>
      <span className="col-span-3 line-clamp-1 text-[13px] text-fg/80 md:col-span-1">
        <span className="font-medium text-fg">{cityName(l.city)}</span>
        {placeLine(l) && (
          <span className="text-muted">
            {" · "}
            <bdi>{placeLine(l)}</bdi>
          </span>
        )}
      </span>
      <span className="hidden text-[12px] text-muted md:block">{sourceName(l.source)}</span>
      {removed ? (
        <span className="hidden text-[12px] leading-tight text-faint md:block" title={removedHint(l)}>
          <span className="block font-medium text-muted">{l.source === "madlan" ? "Likely removed" : "Removed"}</span>
          {relativeTime(l.removedAt, now)}
        </span>
      ) : (
        <span className="hidden text-[12px] text-faint md:block">{relativeTime(l.postedAt ?? l.firstSeenAt, now)}</span>
      )}
      <svg className="hidden size-3.5 text-faint transition-colors group-hover:text-accent md:block" viewBox="0 0 12 12" fill="none">
        <path d="M3.5 8.5 8.5 3.5M4.5 3.5h4v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  );
}
