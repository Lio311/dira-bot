import webpush from "web-push";
import { and, eq, gt, isNull, lte, or } from "drizzle-orm";
import type { getDb } from "../../src/db/client";
import { listings, pushSubscriptions } from "../../src/db/schema";
import { pushDigest } from "../../src/lib/push-digest";
import { validPushSubscription } from "../../src/lib/push-validation";

export async function sendMobileAlerts(db: ReturnType<typeof getDb>, log: (...args: unknown[]) => void) {
  const { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey, VAPID_SUBJECT: subject } = process.env;
  if (!publicKey || !privateKey || !subject) { log("push: not configured, skipped"); return; }
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    const devices = await db.select().from(pushSubscriptions);
    if (!devices.length) return;
    const until = new Date();
    const oldest = new Date(Math.min(...devices.map((s) => s.lastDeliveredAt.getTime())));
    const rows = await db.select().from(listings).where(and(
      isNull(listings.duplicateOf), isNull(listings.removedAt), lte(listings.firstSeenAt, until),
      or(gt(listings.firstSeenAt, oldest), gt(listings.lastSeenAt, oldest)),
    ));
    for (const device of devices) {
      const subscription = { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } };
      if (!validPushSubscription(subscription)) { log(`push: invalid device ${device.id}, skipped`); continue; }
      const payload = pushDigest(rows, device.lastDeliveredAt, until);
      try {
        if (payload) await webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 86400, timeout: 10000 });
        await db.update(pushSubscriptions).set({ lastDeliveredAt: until }).where(eq(pushSubscriptions.id, device.id));
        if (payload) log(`push: delivered to device ${device.id}`);
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, device.id));
          log(`push: expired device ${device.id} removed`);
        } else log(`push: device ${device.id} failed (${status ?? "connection error"}); will retry`);
      }
    }
  } catch { log("push: delivery unavailable; email continues normally"); }
}
