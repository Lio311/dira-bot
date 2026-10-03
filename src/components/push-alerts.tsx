"use client";

import { useEffect, useId, useRef, useState } from "react";
import { getPushPublicKey, removePushSubscription, savePushSubscription } from "@/lib/push-actions";

function applicationKey(key: string) {
  const decoded = atob(key.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(decoded, (c) => c.charCodeAt(0));
}

const OPT_IN_KEY = "dirabot:push-enabled";
function rememberedOptIn() {
  try { return localStorage.getItem(OPT_IN_KEY) === "1"; } catch { return false; }
}
function rememberOptIn(enabled: boolean) {
  try {
    if (enabled) localStorage.setItem(OPT_IN_KEY, "1");
    else localStorage.removeItem(OPT_IN_KEY);
  } catch { /* The existing browser subscription still works without storage. */ }
}

type State = "loading" | "install" | "unsupported" | "unavailable" | "blocked" | "ready" | "enabled" | "error";

export function PushAlerts() {
  const [state, setState] = useState<State>("loading");
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
      if (ios && !standalone) { if (!cancelled) setState("install"); return; }
      if (!window.isSecureContext || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        if (!cancelled) setState("unsupported"); return;
      }
      try {
        const publicKey = await getPushPublicKey();
        if (!publicKey) { if (!cancelled) setState("unavailable"); return; }
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
        // A failed worker must not leave the notifications control loading forever.
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            navigator.serviceWorker.ready,
            new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Worker activation timed out")), 10000); }),
          ]);
        } finally { if (timer) clearTimeout(timer); }
        const existing = await reg.pushManager.getSubscription();
        // Once permission is granted, future visits restore alerts automatically.
        // Never prompt for new permission outside a user click.
        const sub = existing ?? (Notification.permission === "granted" && rememberedOptIn()
          ? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationKey(publicKey) }) : null);
        const saved = sub ? await savePushSubscription(sub.toJSON()) : false;
        if (sub && !saved) {
          if (!existing) await sub.unsubscribe();
          throw new Error("Could not save subscription");
        }
        if (sub && saved) rememberOptIn(true);
        if (!cancelled) {
          setKey(publicKey); setRegistration(reg);
          setState(Notification.permission === "denied" ? "blocked" : sub && saved ? "enabled" : "ready");
        }
      } catch { if (!cancelled) setState("error"); }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  async function toggle() {
    if (!registration || !key) return;
    setOpen(true); setBusy(true); setMessage("");
    try {
      if (state === "enabled") {
        const sub = await registration.pushManager.getSubscription();
        if (sub) {
          if (!await removePushSubscription(sub.toJSON())) throw new Error("Could not turn off alerts. Please try again.");
          if (!await sub.unsubscribe()) throw new Error("Please try turning off alerts again.");
        }
        rememberOptIn(false);
        setState("ready"); setMessage("Notifications are off on this device.");
      } else {
        // Request permission directly from the click, required for iOS user activation.
        const permissionRequest = Notification.requestPermission();
        setMessage("Allow notifications in your browser's permission prompt.");
        let permissionTimer: ReturnType<typeof setTimeout> | undefined;
        let permission: NotificationPermission;
        try {
          permission = await Promise.race([
            permissionRequest,
            new Promise<never>((_, reject) => {
              permissionTimer = setTimeout(() => reject(new Error("No response from the browser. Open in Safari or Chrome and try again.")), 30000);
            }),
          ]);
        } finally { if (permissionTimer) clearTimeout(permissionTimer); }
        if (permission !== "granted") {
          if (permission === "denied") setState("blocked");
          setMessage("Allow notifications to enable mobile alerts."); return;
        }
        const existing = await registration.pushManager.getSubscription();
        const sub = existing ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationKey(key) });
        if (!await savePushSubscription(sub.toJSON())) {
          if (!existing) await sub.unsubscribe();
          throw new Error("Could not save alerts. Please try again.");
        }
        rememberOptIn(true);
        setState("enabled"); setMessage("Notifications are on. You'll receive updates after the next scan.");
      }
    } catch (error) {
      setMessage(error instanceof Error && /try again/.test(error.message) ? error.message : "Could not update notifications. Please try again.");
    } finally { setBusy(false); }
  }

  const description: Record<State, string> = {
    loading: "Checking notifications on this device…",
    install: 'On iPhone or iPad (iOS 16.4+), choose Share → Add to Home Screen, then open diraBot from its icon to enable alerts.',
    unsupported: "Open in a browser that supports push notifications over HTTPS.",
    unavailable: "Mobile alerts aren't available yet. You can subscribe by email above.",
    blocked: "Notifications are blocked. Allow them in your browser or device settings, then reopen the app.",
    ready: "New listings and price changes after each scan, even when the app is closed.",
    enabled: "Notifications are on for this device. New listings and price changes after each scan.",
    error: "Couldn't load notifications. Reload the page to try again.",
  };
  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        aria-label={state === "enabled" ? "Notifications are on" : "Notifications"}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => {
          if (state === "ready") void toggle();
          else setOpen((value) => !value);
        }}
        disabled={busy}
        title={state === "enabled" ? "Notifications are on" : "Notifications"}
        className={`relative inline-flex size-11 items-center justify-center rounded-full border border-border bg-surface transition-colors hover:border-border-strong disabled:opacity-60 ${state === "enabled" ? "text-accent" : "text-muted hover:text-fg"}`}
      >
        <svg viewBox="0 0 20 20" className="size-4.5" fill="none" aria-hidden>
          <path d="M5 8a5 5 0 0 1 10 0v3l1.3 2.4a.7.7 0 0 1-.6 1H4.3a.7.7 0 0 1-.6-1L5 11V8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M8 17a2.2 2.2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {state === "enabled" && <span aria-hidden className="absolute right-2 top-2 size-1.5 rounded-full bg-accent" />}
      </button>
      {open && (
        <div id={panelId} className="absolute right-0 top-full z-40 mt-2 w-[min(288px,calc(100vw-32px))] rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-lift)]">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-semibold">Mobile notifications</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close notifications" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2">×</button>
          </div>
          <p role="status" className="mt-1 text-[13px] leading-relaxed text-muted">{message || description[state]}</p>
          {(state === "ready" || state === "enabled") && (
            <button type="button" onClick={toggle} disabled={busy} className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-[10px] bg-fg px-4 text-[13px] font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-60">
              {busy ? "Updating…" : state === "enabled" ? "Turn off on this device" : "Enable notifications"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
