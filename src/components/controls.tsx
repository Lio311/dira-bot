"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

/** Segmented control with a sliding thumb shared across options via layoutId. */
export function Segmented<T extends string | number>({
  id,
  value,
  options,
  onChange,
}: {
  id: string;
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" className="relative inline-flex h-9 shrink-0 items-center rounded-[10px] bg-surface-2 p-[3px]">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`relative z-0 h-full whitespace-nowrap rounded-[7px] px-3 text-[13px] font-medium transition-colors duration-150 active:scale-[0.97] ${
              active ? "text-fg" : "text-muted hover:text-fg"
            }`}
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

export function Select<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <label className="relative inline-flex h-9 shrink-0 items-center rounded-[10px] border border-border bg-surface pl-3 pr-8 text-[13px] font-medium text-fg transition-colors hover:border-border-strong focus-within:border-accent">
      <span className="mr-1.5 text-muted">{label}</span>
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
      <span className="pointer-events-none">{options.find((o) => o.value === value)?.label}</span>
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
      className="group inline-flex h-9 shrink-0 items-center gap-2 rounded-[10px] px-2 text-[13px] font-medium text-muted transition-colors hover:text-fg"
    >
      <span
        className={`relative h-[18px] w-[30px] rounded-full transition-colors duration-200 ease-out ${on ? "bg-accent" : "bg-border-strong"}`}
      >
        <span
          className={`absolute top-[2px] size-[14px] rounded-full bg-white shadow-sm transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] ${
            on ? "translate-x-[14px]" : "translate-x-[2px]"
          }`}
        />
      </span>
      <span className={on ? "text-fg" : ""}>{children}</span>
    </button>
  );
}
