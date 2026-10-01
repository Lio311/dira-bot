"use client";

import { motion } from "motion/react";
import { useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

/** Segmented control with a sliding thumb shared across options via layoutId (`id` must be unique per rendered instance). */
export function Segmented<T extends string | number>({
  id,
  value,
  options,
  onChange,
  full,
  label,
}: {
  id: string;
  value: T;
  options: { value: T; label: ReactNode; ariaLabel?: string }[];
  onChange: (v: T) => void;
  /** Stretch to the container width with equal-width options. */
  full?: boolean;
  label?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`relative h-9 shrink-0 items-center rounded-[10px] bg-surface-2 p-[3px] ${full ? "flex w-full" : "inline-flex"}`}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            role="radio"
            aria-checked={active}
            aria-label={o.ariaLabel}
            onClick={() => onChange(o.value)}
            className={`relative z-0 inline-flex h-full items-center justify-center whitespace-nowrap rounded-[7px] text-[13px] font-medium transition-colors duration-150 active:scale-[0.97] ${
              full ? "flex-1 px-2" : "px-3"
            } ${active ? "text-fg" : "text-muted hover:text-fg"}`}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 -z-10 rounded-[7px] bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_1px_var(--border)]"
                transition={{ type: "spring", duration: 0.32, bounce: 0.12 }}
              />
            )}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Chip({
  active,
  onClick,
  children,
  dotColor,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  dotColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] font-medium transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.96] ${
        active
          ? "border-fg bg-fg text-bg"
          : "border-border bg-surface text-muted hover:border-border-strong hover:text-fg"
      }`}
    >
      {dotColor && <span className="size-1.5 rounded-full" style={{ background: dotColor }} />}
      {children}
    </button>
  );
}

/** Compact multi-select: a labelled group of pressable options (e.g. Rooms 4 · 4.5 · 5). */
export function ToggleGroup<T extends string | number>({
  label,
  values,
  options,
  onChange,
}: {
  label: string;
  values: T[];
  options: { value: T; label: ReactNode }[];
  onChange: (v: T[]) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex h-9 shrink-0 items-center gap-0.5 rounded-[10px] border border-border bg-surface p-[3px]">
      <span className="pl-2 pr-1 text-[13px] font-medium text-muted">{label}</span>
      {options.map((o) => {
        const on = values.includes(o.value);
        return (
          <button
            key={String(o.value)}
            aria-pressed={on}
            onClick={() => onChange(options.filter((x) => (x.value === o.value ? !on : values.includes(x.value))).map((x) => x.value))}
            className={`h-full min-w-8 rounded-[7px] px-2 text-[13px] font-medium tabular transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.96] ${
              on ? "bg-fg text-bg" : "text-muted hover:bg-surface-2 hover:text-fg"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  label,
  className = "",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
  className?: string;
}) {
  return (
    <label
      className={`relative inline-flex h-9 min-w-0 shrink-0 items-center rounded-[10px] border border-border bg-surface pl-3 pr-8 text-[13px] font-medium text-fg transition-colors hover:border-border-strong focus-within:border-accent ${className}`}
    >
      <span className="mr-1.5 shrink-0 text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label={label}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none min-w-0 truncate">{options.find((o) => o.value === value)?.label}</span>
      <svg className="pointer-events-none absolute right-2.5 size-3.5 text-muted" viewBox="0 0 16 16" fill="none">
        <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </label>
  );
}

export function Toggle({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="inline-flex h-9 shrink-0 items-center gap-2 rounded-[10px] px-2 text-[13px] font-medium text-muted transition-[color,scale] duration-150 hover:text-fg active:scale-[0.97]"
    >
      {/* Track: 30×18 with 2px padding, so the 14px knob travels exactly 12px. */}
      <span
        className={`flex h-[18px] w-[30px] shrink-0 items-center rounded-full p-[2px] transition-colors duration-200 ease-out ${on ? "bg-accent" : "bg-border-strong"}`}
      >
        <span
          className={`size-[14px] shrink-0 rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.2)] transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] ${
            on ? "translate-x-[12px]" : "translate-x-0"
          }`}
        />
      </span>
      <span className={`whitespace-nowrap ${on ? "text-fg" : ""}`}>{children}</span>
    </button>
  );
}

/**
 * Bins values for RangeSlider's histogram: `bins` equal buckets spanning [min, max].
 * Values outside the bounds land in the first/last bucket (open-ended ranges).
 */
export function buildHistogram(values: number[], min: number, max: number, bins: number) {
  const out = new Array<number>(bins).fill(0);
  const span = max - min || 1;
  for (const v of values) out[Math.min(bins - 1, Math.max(0, Math.floor(((v - min) / span) * bins)))]++;
  return out;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Dual-thumb range slider. Controlled: `value` is [low, high]; `onChange` fires on every step while dragging.
 * Keyboard: arrows ±step, PageUp/PageDown ±10 steps, Home/End. Pressing the track moves the nearest thumb.
 */
export function RangeSlider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  format,
  minGap = step,
  openEnd = false,
  histogram,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: [number, number];
  onChange: (v: [number, number]) => void;
  /** `open` is true for the top value when the range is open-ended (e.g. render "250+"). */
  format: (v: number, open: boolean) => string;
  /** Smallest allowed distance between the thumbs. */
  minGap?: number;
  /** The top of the scale means "and above". */
  openEnd?: boolean;
  /** Bucket counts spanning [min, max] (see buildHistogram). */
  histogram?: number[];
}) {
  const labelId = useId();
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dragging = useRef<0 | 1 | null>(null);
  const [active, setActive] = useState<0 | 1 | null>(null);
  const [lo, hi] = value;
  const span = max - min || 1;
  const pct = (v: number) => ((clamp(v, min, max) - min) / span) * 100;
  const fmt = (v: number) => format(v, openEnd && v >= max);

  const commit = (i: 0 | 1, raw: number) => {
    const snapped = Math.round((raw - min) / step) * step + min;
    const next: [number, number] = i === 0 ? [clamp(snapped, min, hi - minGap), hi] : [lo, clamp(snapped, lo + minGap, max)];
    if (next[0] !== lo || next[1] !== hi) onChange(next);
  };

  const valueAt = (clientX: number) => {
    const r = trackRef.current!.getBoundingClientRect();
    return min + clamp((clientX - r.left) / r.width, 0, 1) * span;
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const v = valueAt(e.clientX);
    const hit = (e.target as HTMLElement).closest<HTMLElement>("[data-thumb]")?.dataset.thumb;
    const i: 0 | 1 = hit ? (hit === "1" ? 1 : 0) : v <= lo ? 0 : v >= hi ? 1 : v - lo < hi - v ? 0 : 1;
    e.preventDefault(); // no text selection / focus jump; focus the thumb explicitly instead
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = i;
    setActive(i);
    thumbRefs.current[i]?.focus({ preventScroll: true });
    if (!hit) commit(i, v);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current != null) commit(dragging.current, valueAt(e.clientX));
  };
  const endDrag = () => {
    dragging.current = null;
    setActive(null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>, i: 0 | 1) => {
    const v = value[i];
    const next = (
      {
        ArrowLeft: v - step,
        ArrowDown: v - step,
        ArrowRight: v + step,
        ArrowUp: v + step,
        PageDown: v - step * 10,
        PageUp: v + step * 10,
        Home: min,
        End: max,
      } as Record<string, number>
    )[e.key];
    if (next === undefined) return;
    e.preventDefault();
    commit(i, next);
  };

  const bins = histogram ?? [];
  const peak = Math.max(1, ...bins);

  return (
    <div role="group" aria-labelledby={labelId} className="select-none">
      <div className="flex items-baseline justify-between gap-3">
        <span id={labelId} className="text-[13px] font-semibold text-fg">
          {label}
        </span>
        <span className="text-[13px] font-medium text-muted tabular">
          {fmt(lo)} – {fmt(hi)}
        </span>
      </div>
      {/* Inset by half a thumb so both thumbs stay inside the component at the extremes. */}
      <div className="mt-3 px-3.5">
        {bins.length > 0 && (
          <div aria-hidden className="flex h-10 items-end gap-[2px]">
            {bins.map((n, i) => {
              const start = min + (i / bins.length) * span;
              const end = min + ((i + 1) / bins.length) * span;
              const inside = end > lo && start <= hi;
              return (
                <span
                  key={i}
                  className={`min-w-0 flex-1 rounded-t-[2px] transition-[height,background-color] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] ${
                    inside ? "bg-accent" : "bg-border-strong"
                  }`}
                  style={{ height: n ? `${Math.max(8, (n / peak) * 100)}%` : 0 }}
                />
              );
            })}
          </div>
        )}
        <div
          ref={trackRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="relative h-7 cursor-pointer touch-none"
        >
          <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-border-strong" />
          <div
            className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-accent"
            style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }}
          />
          {([0, 1] as const).map((i) => {
            const v = value[i];
            return (
              <div
                key={i}
                ref={(el) => {
                  thumbRefs.current[i] = el;
                }}
                data-thumb={i}
                role="slider"
                tabIndex={0}
                aria-label={`${label} ${i ? "maximum" : "minimum"}`}
                aria-valuemin={i ? lo + minGap : min}
                aria-valuemax={i ? max : hi - minGap}
                aria-valuenow={v}
                aria-valuetext={fmt(v)}
                aria-orientation="horizontal"
                onKeyDown={(e) => onKeyDown(e, i)}
                className="group absolute top-1/2 grid size-7 -translate-x-1/2 -translate-y-1/2 cursor-grab place-items-center rounded-full outline-none active:cursor-grabbing"
                // The low thumb goes on top once it passes the middle so it can always be grabbed back.
                style={{ left: `${pct(v)}%`, zIndex: active === i ? 3 : i === 0 && pct(lo) > 50 ? 2 : 1 }}
              >
                <span
                  className={`size-5 rounded-full border border-black/10 bg-white shadow-[0_1px_2px_rgb(0_0_0/0.14),0_2px_8px_rgb(0_0_0/0.08)] transition-[scale,box-shadow] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] group-focus-visible:ring-4 group-focus-visible:ring-accent/30 ${
                    active === i ? "scale-[1.18]" : "group-hover:scale-110"
                  }`}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
