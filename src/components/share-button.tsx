"use client";

import { useEffect, useRef, useState } from "react";
import { shareListing } from "@/lib/share-listing";

export function ShareButton({ url, title, className = "" }: { url: string; title: string; className?: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button type="button" aria-label={`Share ${title}`} onClick={async () => {
      try {
        const result = await shareListing(url, title);
        if (result === "copied") setStatus("copied");
      } catch { setStatus("error"); }
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setStatus("idle"), 2500);
    }} className={`inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[12px] font-medium text-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40 ${className}`}>
      <svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-hidden="true"><path d="M8 10V2m-3 3 3-3 3 3M4 7H2.5v6.5h11V7H12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <span aria-live="polite">{status === "copied" ? "Copied!" : status === "error" ? "Try again" : "Share"}</span>
    </button>
  );
}
