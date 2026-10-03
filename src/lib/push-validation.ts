import type { PushSubscription } from "web-push";

// Only official push services may become outbound destinations (prevents SSRF).
const hosts = ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com", "notify.windows.com"];
export function validPushSubscription(value: unknown): value is PushSubscription {
  if (!value || typeof value !== "object") return false;
  const s = value as Partial<PushSubscription>;
  if (typeof s.endpoint !== "string" || s.endpoint.length > 2048) return false;
  try {
    const u = new URL(s.endpoint);
    if (u.protocol !== "https:" || u.username || u.password || u.port || u.hash) return false;
    if (!hosts.some((host) => u.hostname === host || u.hostname.endsWith(`.${host}`))) return false;
  } catch { return false; }
  if (!s.keys || typeof s.keys.p256dh !== "string" || typeof s.keys.auth !== "string") return false;
  if (!/^[\w-]{87}=?$/.test(s.keys.p256dh) || !/^[\w-]{22}={0,2}$/.test(s.keys.auth)) return false;
  const key = Buffer.from(s.keys.p256dh, "base64url");
  return key.length === 65 && key[0] === 4 && Buffer.from(s.keys.auth, "base64url").length === 16;
}
