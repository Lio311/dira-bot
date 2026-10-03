"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { SOURCES, type SourceKey } from "@/lib/config";
import type { ListingView } from "@/lib/data";
import { ils, ilsShort, relativeTime } from "@/lib/format";
import { isMotivated, motivatedReason, motivatedReasonLong, type PriceEntry } from "@/lib/price-history";

const EASE: [number, number, number, number] = [0.23, 1, 0.32, 1];
const WIDTH = 320;
const DAY = 86_400_000;
const GUTTER = 16;

type Dir = "down" | "up" | "flat";
const dirOf = (n: number): Dir => (n < 0 ? "down" : n > 0 ? "up" : "flat");

const TONE: Record<Dir, CSSProperties> = {
  down: { color: "var(--drop)", background: "var(--drop-soft)" },
  up: { color: "var(--rise)", background: "var(--rise-soft)" },
  flat: { color: "var(--muted)", background: "var(--surface-2)" },
};
const ARROW: Record<Dir, string> = { down: "↓", up: "↑", flat: "↔" };

const sourceName = (s: string) => SOURCES[s as SourceKey]?.name ?? s;

const fmtDate = (iso: string, now: number) => {
  const d = new Date(iso);
  const sameYear = d.getUTCFullYear() === new Date(now).getUTCFullYear();
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), timeZone: "Asia/Jerusalem" });
};

/** "Was ₪3.9M · changed 3d ago": the badge's tooltip and the map popup's line. */
export function priceChangeHint(l: Pick<ListingView, "price" | "priceChange" | "priceChangedAt" | "source">, now: number) {
  if (l.priceChange == null || l.price == null) return null;
  const was = `Was ${ilsShort(l.price - l.priceChange)}`;
  return l.priceChangedAt ? `${was} · changed ${relativeTime(l.priceChangedAt, now)}` : `${was} · per ${sourceName(l.source)}`;
}

export const motivatedHint = (l: ListingView) => `Motivated seller (${motivatedReasonLong(l)}): may be open to an offer`;

/** Down-stepping line: the "kept cutting" mark. */
function CutsIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" fill="none" aria-hidden className={className}>
      <path d="M1.5 3h2.5v2.5h2.5V8h2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 10h2.5V7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Marks a motivated seller (see isMotivated): "Motivated · 3 cuts" / "Motivated · −7%".
 * `overlay` sits on a photo (solid), `inline` next to a price (soft).
 */
export function MotivatedBadge({ l, variant = "inline", className = "" }: { l: ListingView; variant?: "overlay" | "inline"; className?: string }) {
  if (!isMotivated(l)) return null;
  return (
    <span
      title={motivatedHint(l)}
      aria-label={`Motivated seller: ${motivatedReasonLong(l)}`}
      style={variant === "overlay" ? { color: "var(--hot-fg)", background: "var(--hot)" } : { color: "var(--hot)", background: "var(--hot-soft)" }}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap font-semibold ${
        variant === "overlay" ? "h-[22px] rounded-full px-2 text-[11px] shadow-sm" : "h-5 rounded-md px-1.5 text-[11px]"
      } ${className}`}
    >
      <CutsIcon className="size-3" />
      {variant === "overlay" ? `Motivated · ${motivatedReason(l)}` : motivatedReason(l)}
    </span>
  );
}

/**
 * Compact "↓ ₪120K" / "↑ ₪50K" badge for a listing whose price changed (vs the first known price).
 * A button: click (tap) toggles the history popover, hovering with a mouse previews it.
 * Must not be rendered inside a link; cards place it as a positioned sibling.
 */
export function PriceChangeBadge({
  l,
  now,
  size = "md",
  className = "",
}: {
  l: ListingView;
  now: number;
  size?: "sm" | "md";
  className?: string;
}) {
  const [open, setOpen] = useState<false | "hover" | "pinned">(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const popId = useId();

  const schedule = useCallback((fn: () => void, ms: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(fn, ms);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const close = useCallback((refocus = false) => {
    window.clearTimeout(timer.current);
    setOpen(false);
    if (refocus) triggerRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !popRef.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(true);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  if (l.priceChange == null || l.price == null) return null;
  const dir = dirOf(l.priceChange);
  const amount = dir === "flat" ? "₪0" : ilsShort(Math.abs(l.priceChange));
  const hint = priceChangeHint(l, now)!;
  const label = dir === "flat" ? "Price changed" : `Price ${dir === "down" ? "dropped" : "rose"} ${amount}`;

  const hoverable = (e: ReactPointerEvent) => e.pointerType === "mouse";
  const leave = (e: ReactPointerEvent) => {
    if (hoverable(e) && open !== "pinned") schedule(() => setOpen((o) => (o === "hover" ? false : o)), 160);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        title={open ? undefined : hint}
        aria-label={`${label}. ${hint}. Price history`}
        aria-expanded={!!open}
        aria-haspopup="dialog"
        aria-controls={open ? popId : undefined}
        onClick={() => {
          window.clearTimeout(timer.current);
          setOpen((o) => (o === "pinned" ? false : "pinned"));
        }}
        onPointerEnter={(e) => {
          if (hoverable(e) && !open) schedule(() => setOpen((o) => o || "hover"), 140);
          else if (hoverable(e)) window.clearTimeout(timer.current);
        }}
        onPointerLeave={leave}
        style={TONE[dir]}
        className={`inline-flex shrink-0 cursor-pointer items-center gap-0.5 whitespace-nowrap font-semibold tabular outline-none transition-[scale,filter,box-shadow] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:brightness-[0.97] focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.97] ${
          size === "sm" ? "h-5 rounded-md px-1.5 text-[11px]" : "h-[22px] rounded-full px-2 text-[11px] shadow-[0_1px_2px_rgb(0_0_0/0.12)]"
        } max-lg:h-10 max-lg:px-3 ${open ? "ring-1 ring-current/30" : ""} ${className}`}
      >
        <span aria-hidden>{ARROW[dir]}</span> {amount}
        <span className="ml-1 text-[11px] max-lg:inline lg:hidden">Price history</span>
      </button>
      <PricePopover
        id={popId}
        open={!!open}
        anchor={triggerRef}
        popRef={popRef}
        onPointerEnter={() => window.clearTimeout(timer.current)}
        onPointerLeave={leave}
        onClose={() => close(true)}
      >
        <PriceHistoryPanel l={l} now={now} />
      </PricePopover>
    </>
  );
}

/** Fixed-position popover in a portal (cards sit in transformed, clipped containers). Follows its anchor on scroll. */
function PricePopover({
  id,
  open,
  anchor,
  popRef,
  children,
  onPointerEnter,
  onPointerLeave,
  onClose,
}: {
  id: string;
  open: boolean;
  anchor: RefObject<HTMLElement | null>;
  popRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
  onPointerEnter: () => void;
  onPointerLeave: (e: ReactPointerEvent) => void;
  onClose: () => void;
}) {
  const reduce = useReducedMotion();
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean; originX: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      if (!a) return;
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      const width = Math.min(WIDTH, vw - GUTTER * 2);
      const height = popRef.current?.offsetHeight ?? 260;
      const left = Math.max(GUTTER, Math.min(a.left + a.width / 2 - width / 2, vw - width - GUTTER));
      const below = a.bottom + 8;
      const above = below + height > vh - GUTTER && a.top - 8 - height > GUTTER;
      const panelHeight = Math.min(height, vh - GUTTER * 2);
      const top = Math.max(GUTTER, Math.min(above ? a.top - 8 - panelHeight : below, vh - GUTTER - panelHeight));
      setPos({ top, left, above, originX: a.left + a.width / 2 - left });
    };
    place();
    // A second pass once the panel has its real height.
    const raf = requestAnimationFrame(place);
    window.addEventListener("scroll", place, { capture: true, passive: true });
    window.addEventListener("resize", place);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", place, { capture: true });
      window.removeEventListener("resize", place);
    };
  }, [open, anchor, popRef]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence onExitComplete={() => setPos(null)}>
      {open && (
        <motion.div
          ref={popRef}
          id={id}
          role="dialog"
          aria-label="Price history"
          onPointerEnter={(e) => e.pointerType === "mouse" && onPointerEnter()}
          onPointerLeave={onPointerLeave}
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: pos?.above ? 4 : -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: pos?.above ? 4 : -4 }}
          transition={{ duration: 0.18, ease: EASE }}
          style={{
            top: pos?.top ?? -9999,
            left: pos?.left ?? 0,
            width: `min(${WIDTH}px, calc(100vw - ${GUTTER * 2}px))`,
            transformOrigin: `${pos?.originX ?? WIDTH / 2}px ${pos?.above ? "100%" : "0"}`,
            visibility: pos ? "visible" : "hidden",
          }}
          className="fixed z-[60] max-h-[calc(100dvh-32px)] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-surface p-3.5 text-fg shadow-[var(--shadow-lift)]"
        >
          <div className="mb-2 flex justify-end lg:hidden">
            <button type="button" onClick={onClose} aria-label="Close price history" className="flex h-9 items-center rounded-lg border border-border px-3 text-[12px] font-medium">Close ×</button>
          </div>
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function PriceHistoryPanel({ l, now }: { l: ListingView; now: number }) {
  const points = l.priceHistory;
  const change = l.priceChange ?? 0;
  const first = (l.price ?? 0) - change;
  const pct = first ? (change / first) * 100 : 0;
  const dir = dirOf(change);
  const site = sourceName(l.source);
  const rows = points.map((p, i) => ({ p, delta: i > 0 ? p.price - points[i - 1].price : null })).reverse();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[13px] font-semibold">Price history</h3>
        <span className="text-[12px] font-semibold tabular" style={{ color: TONE[dir].color }}>
          {ARROW[dir]} {ilsShort(Math.abs(change))}
          {dir !== "flat" && <span className="ml-1 font-medium opacity-80">({Math.abs(pct).toFixed(pct && Math.abs(pct) < 1 ? 1 : 0)}%)</span>}
        </span>
      </div>
      {isMotivated(l) && (
        <p className="-mt-1.5 flex items-center gap-1.5 text-[12px] font-medium" style={{ color: "var(--hot)" }}>
          <CutsIcon className="size-3.5 shrink-0" />
          Motivated seller · {motivatedReasonLong(l)}
        </p>
      )}
      <PriceChart points={points} now={now} />
      <ol className="-mx-1 flex max-h-[220px] flex-col overflow-y-auto overscroll-contain">
        {rows.map(({ p, delta }, i) => (
          <li key={`${p.at}-${p.price}`} className={`flex items-center justify-between gap-3 rounded-lg px-1 py-1.5 ${i === 0 ? "" : "border-t border-border"}`}>
            <span className="min-w-0 text-[12px] leading-tight">
              <span className={`block ${i === 0 ? "font-medium text-fg" : "text-muted"}`}>
                {p.undated ? "Earlier" : fmtDate(p.at, now)}
                {i === 0 && <span className="ml-1 font-normal text-faint">· now</span>}
              </span>
              {p.relisted ? (
                <span className="block text-[11px] text-faint">relisted as a new ad</span>
              ) : (
                p.source === "site" && <span className="block text-[11px] text-faint">per {site}</span>
              )}
            </span>
            <span className="flex shrink-0 items-baseline gap-2 tabular">
              <span className={`text-[13px] ${i === 0 ? "font-semibold" : "text-fg/80"}`}>{ils(p.price)}</span>
              <span className="w-[54px] text-right text-[11px] font-semibold" style={{ color: delta == null ? "var(--faint)" : TONE[dirOf(delta)].color }}>
                {delta == null ? "first" : `${ARROW[dirOf(delta)]} ${ilsShort(Math.abs(delta))}`}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Price over time: a step line (the price holds until the next change) on a real time axis that
 * runs on to today, one dot per change. Undated site entries have no place on the axis, so they
 * sit in a narrow slot at the left joined by a dashed line. Hover, or focus and use the arrow keys,
 * for a crosshair readout; the list below the chart is the full table.
 */
function PriceChart({ points, now }: { points: PriceEntry[]; now: number }) {
  const [active, setActive] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  if (points.length < 2) return null;

  const W = WIDTH - 28; // popover width minus its padding
  const H = 128;
  const [L, R, T, B] = [6, 48, 10, 22]; // R holds the price labels, B the dates
  const firstDated = Math.max(0, points.findIndex((p) => !p.undated));
  const slot = firstDated > 0 ? 26 : 0;
  const t0 = new Date(points[firstDated].at).getTime();
  const tEnd = Math.max(now, new Date(points[points.length - 1].at).getTime());
  const span = Math.max(tEnd - t0, DAY);
  const x = (i: number) =>
    i < firstDated ? L + (slot * i) / firstDated : L + slot + ((new Date(points[i].at).getTime() - t0) / span) * (W - R - L - slot);

  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const pad = (max - min) * 0.14;
  const y = (v: number) => T + (1 - (v - (min - pad)) / (max - min + pad * 2)) * (H - T - B);

  let pre = "";
  if (firstDated > 0) {
    pre = `M${x(0)},${y(prices[0])}`;
    for (let i = 1; i < firstDated; i++) pre += `H${x(i)}V${y(prices[i])}`;
    pre += `H${x(firstDated)}`;
  }
  let line = firstDated > 0 ? `M${x(firstDated)},${y(prices[firstDated - 1])}V${y(prices[firstDated])}` : `M${x(0)},${y(prices[0])}`;
  for (let i = firstDated + 1; i < points.length; i++) line += `H${x(i)}V${y(prices[i])}`;
  line += `H${W - R}`;
  const area = `${pre ? pre + line.replace(/^M[^V]*/, "") : line}V${H - B}H${x(0)}Z`;

  const nearest = (clientX: number) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return null;
    const px = ((clientX - box.left) / box.width) * W;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    return best;
  };

  const first = points[0];
  const last = points[points.length - 1];
  const summary = `Price chart: ${ils(first.price)}${first.undated ? " earlier" : ` on ${fmtDate(first.at, now)}`}, now ${ils(last.price)}, ${points.length - 1} change${points.length === 2 ? "" : "s"}.`;
  const a = active == null ? null : points[active];
  const delta = active ? points[active].price - points[active - 1].price : null;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full touch-pan-y overflow-visible rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent"
        role="img"
        aria-label={summary}
        tabIndex={0}
        onPointerMove={(e) => setActive(nearest(e.clientX))}
        onPointerDown={(e) => setActive(nearest(e.clientX))}
        onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}
        onFocus={() => setActive((i) => i ?? points.length - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          const step = e.key === "ArrowLeft" ? -1 : 1;
          setActive((i) => Math.max(0, Math.min(points.length - 1, (i ?? points.length - 1) + step)));
        }}
      >
        {/* Hairlines at the highest and lowest price, labelled on the right. */}
        {[max, min].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth="1" />
            <text x={W - R + 6} y={y(v)} dy="0.35em" fontSize="10" fill="var(--muted)" className="tabular">
              {ilsShort(v)}
            </text>
          </g>
        ))}
        <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke="var(--border-strong)" strokeWidth="1" />
        <text x={x(firstDated)} y={H - B + 14} fontSize="10" fill="var(--faint)" textAnchor={firstDated > 0 ? "middle" : "start"}>
          {fmtDate(points[firstDated].at, now)}
        </text>
        <text x={W - R} y={H - B + 14} fontSize="10" fill="var(--faint)" textAnchor="end">
          Today
        </text>

        <path d={area} fill="var(--accent)" opacity="0.1" />
        {pre && <path d={pre} fill="none" stroke="var(--accent)" strokeWidth="2" strokeDasharray="3 3" strokeLinecap="round" strokeLinejoin="round" />}
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {active != null && <line x1={x(active)} x2={x(active)} y1={T - 4} y2={H - B} stroke="var(--muted)" strokeWidth="1" opacity="0.6" />}
        {points.map((p, i) => (
          <circle
            key={`${p.at}-${p.price}`}
            cx={x(i)}
            cy={y(p.price)}
            r={i === active ? 5 : 4}
            fill={p.relisted ? "var(--surface)" : "var(--accent)"}
            stroke={p.relisted ? "var(--accent)" : "var(--surface)"}
            strokeWidth="2"
          />
        ))}
      </svg>
      {a && (
        <div
          aria-hidden
          className="pointer-events-none absolute -top-1 z-10 rounded-lg border border-border bg-surface px-2 py-1.5 text-[11px] leading-tight whitespace-nowrap shadow-[var(--shadow-lift)]"
          style={{
            left: `${(x(active!) / W) * 100}%`,
            transform: `translate(${x(active!) < W * 0.3 ? "-12%" : x(active!) > W * 0.7 ? "-88%" : "-50%"}, -100%)`,
          }}
        >
          <span className="block text-muted">
            {a.undated ? "Earlier" : fmtDate(a.at, now)}
            {a.relisted && " · relisted"}
            {active === points.length - 1 && " · current"}
          </span>
          <span className="flex items-baseline gap-1.5 tabular">
            <span className="text-[12.5px] font-semibold text-fg">{ils(a.price)}</span>
            {delta != null && (
              <span className="font-semibold" style={{ color: TONE[dirOf(delta)].color }}>
                {ARROW[dirOf(delta)]} {ilsShort(Math.abs(delta))}
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
