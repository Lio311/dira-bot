"use server";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { pushSubscriptions } from "@/db/schema";
import { validPushSubscription } from "./push-validation";

export async function getPushPublicKey() {
  return process.env.DATABASE_URL && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT
    ? process.env.VAPID_PUBLIC_KEY ?? null : null;
}

export async function savePushSubscription(value: unknown): Promise<boolean> {
  if (!validPushSubscription(value) || !await getPushPublicKey()) return false;
  try {
    // Reopening the app must not reset the cursor and lose undelivered alerts.
    await getDb().insert(pushSubscriptions).values({
      endpoint: value.endpoint, p256dh: value.keys.p256dh, auth: value.keys.auth,
    }).onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { p256dh: value.keys.p256dh, auth: value.keys.auth },
      // Endpoint + secret keys act as the capability for this device only.
      setWhere: and(eq(pushSubscriptions.auth, value.keys.auth), eq(pushSubscriptions.p256dh, value.keys.p256dh)),
    });
    return true;
  } catch {
    console.error("push: could not save device subscription");
    return false;
  }
}

export async function removePushSubscription(value: unknown): Promise<boolean> {
  if (!validPushSubscription(value)) return false;
  try {
    await getDb().delete(pushSubscriptions).where(and(
      eq(pushSubscriptions.endpoint, value.endpoint), eq(pushSubscriptions.auth, value.keys.auth),
      eq(pushSubscriptions.p256dh, value.keys.p256dh),
    ));
    return true;
  } catch {
    console.error("push: could not remove device subscription");
    return false;
  }
}
