"use client";

import { useEffect, useState } from "react";
import { getPushPublicKey, removePushSubscription, savePushSubscription } from "@/lib/push-actions";

function applicationKey(key: string) {
  const decoded = atob(key.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(decoded, (c) => c.charCodeAt(0));
}

type State = "loading" | "install" | "unsupported" | "unavailable" | "blocked" | "ready" | "enabled" | "error";

export function PushAlerts() {
  const [state, setState] = useState<State>("loading");
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

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
        await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        const saved = sub ? await savePushSubscription(sub.toJSON()) : false;
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
    setBusy(true); setMessage("");
    try {
      if (state === "enabled") {
        const sub = await registration.pushManager.getSubscription();
        if (sub) {
          if (!await removePushSubscription(sub.toJSON())) throw new Error("Could not turn off alerts. Please try again.");
          if (!await sub.unsubscribe()) throw new Error("Please try turning off alerts again.");
        }
        setState("ready"); setMessage("Notifications are off on this device.");
      } else {
        // Request permission directly from the click, required for iOS user activation.
        const permission = await Notification.requestPermission();
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
    <section aria-labelledby="push-title" className="mt-3 flex flex-col gap-3 rounded-2xl border border-border bg-surface px-5 py-4 shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h2 id="push-title" className="text-[14px] font-semibold tracking-[-0.01em]">Get mobile notifications</h2>
        <p className="mt-0.5 max-w-xl text-[13px] leading-snug text-muted">{description[state]}</p>
        {message && <p role="status" className="mt-2 text-[12px] text-accent">{message}</p>}
      </div>
      {(state === "ready" || state === "enabled") && (
        <button type="button" onClick={toggle} disabled={busy} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-[10px] bg-fg px-4 text-[13px] font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-60">
          {busy ? "Updating…" : state === "enabled" ? "Turn off" : "Enable notifications"}
        </button>
      )}
    </section>
  );
}
