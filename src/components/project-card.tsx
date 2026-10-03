"use client";

import { useState } from "react";
import type { ListingView } from "@/lib/data";
import { cityName } from "@/lib/config";
import { relativeTime } from "@/lib/format";
import { PROJECT_STAGE, projectLocationLabel, projectPriceLines } from "@/lib/projects";
import { StarButton } from "./favorites";
import { LogoMark } from "./logo";

export function ProjectCard({ l, now, onHover, highlighted = false, compact = false }: {
  l: ListingView; now: number; onHover?: (id: number | null) => void; highlighted?: boolean; compact?: boolean;
}) {
  const [imgOk, setImgOk] = useState(!!l.image);
  const p = l.project!;
  return (
    <div onMouseEnter={() => onHover?.(l.id)} onMouseLeave={() => onHover?.(null)}
      className={`relative h-full overflow-hidden rounded-2xl border bg-surface shadow-[var(--shadow-card)] ${highlighted ? "border-accent ring-1 ring-accent" : "border-border"}`}>
      <a href={l.url} target="_blank" rel="noopener noreferrer"
        className="flex h-full flex-col outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent">
        {!compact && <div className="relative aspect-[16/10] overflow-hidden">
          {imgOk ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={l.image!} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImgOk(false)} className="size-full object-cover" />
          ) : <div className="blueprint grid size-full place-items-center text-faint"><LogoMark size={34} className="opacity-50" /></div>}
          <span className="absolute right-3 top-3 rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-fg">▦ New development</span>
        </div>}
        <div className="flex flex-1 flex-col gap-2 p-4">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
            <span className="rounded-full bg-accent-soft px-2 py-0.5 font-semibold text-accent">{cityName(l.city)}</span>
            <span>{PROJECT_STAGE[p.stage]}</span>
          </div>
          <h2 dir="auto" className="text-[17px] font-semibold leading-snug">{l.title}</h2>
          <p dir="auto" className="text-[12px] text-muted">{p.developer}{l.street ? ` · ${l.street}` : ""}</p>
          <div className="space-y-1 border-y border-border py-2.5 text-[13px] font-medium tabular">
            {projectPriceLines(p).map((line, i) => <p key={i} title={p.offers[i]?.evidence || p.generalPriceEvidence}>{line}</p>)}
          </div>
          <p className="text-[11px] leading-relaxed text-muted">Starting prices do not guarantee availability within budget. {p.availability === "marketing" ? "Advertised for sale; confirm availability by room type." : "Sales availability not verified."}</p>
          <p className="text-[11px] text-faint">{projectLocationLabel(p)}{l.lat == null ? " · Not mapped yet" : ""}</p>
          <div className="mt-auto flex items-center justify-between gap-2 pt-2 text-[11px] text-muted">
            <span>Checked {relativeTime(p.checkedAt, now)}</span><span className="font-medium text-accent">Developer website ↗</span>
          </div>
        </div>
      </a>
      <div className="absolute left-3 top-3"><StarButton id={l.id} starred={l.starredAt != null} variant="overlay" /></div>
    </div>
  );
}
