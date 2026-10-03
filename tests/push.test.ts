import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import webpush from "web-push";
import { pushDigest } from "../src/lib/push-digest";
import { validPushSubscription } from "../src/lib/push-validation";
import { sendMobileAlerts } from "../scraper/lib/push";
import { pushSubscriptions, type Listing } from "../src/db/schema";
import type { getDb } from "../src/db/client";

const since = new Date("2026-10-03T08:00:00Z");
const until = new Date("2026-10-03T16:00:00Z");
const row = (patch: Partial<Listing> = {}) => ({
  id: 1, duplicateOf: null, removedAt: null, firstSeenAt: new Date("2026-10-02"), priceHistory: [], ...patch,
} as Listing);
const keys = { p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]).toString("base64url"), auth: Buffer.alloc(16, 2).toString("base64url") };
const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/device", keys };

test("digest omits backlog, duplicates, removals and site-reported history", () => {
  assert.equal(pushDigest([
    row(), row({ firstSeenAt: new Date("2026-10-03T10:00Z"), duplicateOf: 2 }),
    row({ firstSeenAt: new Date("2026-10-03T10:00Z"), removedAt: until }),
    row({ priceHistory: [{ price: 3000000, at: "2026-10-01T00:00Z" }, { price: 2900000, at: "2026-10-03T09:00Z", source: "site" }] }),
  ], since, until), null);
});

test("digest reports new ads once, price changes, and bounds its cursor", () => {
  const payload = pushDigest([
    row({ firstSeenAt: since }), // exact cursor is not new
    row({ firstSeenAt: new Date("2026-10-03T10:00Z"), priceHistory: [{ price: 3, at: "2026-10-03T10:00Z" }, { price: 2, at: "2026-10-03T11:00Z" }] }),
    row({ firstSeenAt: new Date("2026-10-03T17:00Z") }),
    row({ priceHistory: [{ price: 3000000, at: "2026-10-01T00:00Z" }, { price: 2900000, at: "2026-10-03T09:00Z" }, { price: 2950000, at: "2026-10-03T15:00Z" }] }),
  ], since, until);
  assert.equal(payload?.body, "1 דירות חדשות · 1 ירידות מחיר · 1 עליות מחיר");
  assert.equal(pushDigest([row({ firstSeenAt: new Date("2026-10-03T10:00Z") })], until, new Date("2026-10-04")), null);
});

test("subscription validation accepts push providers and rejects arbitrary destinations and malformed keys", () => {
  assert.ok(validPushSubscription(subscription));
  for (const endpoint of ["http://fcm.googleapis.com/send", "https://127.0.0.1/push", "https://fcm.googleapis.com.attacker.com/", "https://attacker.com/?host=web.push.apple.com", "https://user:pass@web.push.apple.com/", "https://web.push.apple.com:8443/"]) {
    assert.equal(validPushSubscription({ ...subscription, endpoint }), false);
  }
  assert.equal(validPushSubscription({ ...subscription, keys: { ...keys, auth: "bad" } }), false);
});

test("delivery advances successful cursors, retries failures, deletes expired devices, independent of email", async () => {
  const originalSend = webpush.sendNotification;
  const originalEnv = { ...process.env };
  const vapid = webpush.generateVAPIDKeys();
  Object.assign(process.env, { VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey, VAPID_SUBJECT: "mailto:test@example.com" });
  const advanced: number[] = [];
  const deleted: number[] = [];
  const devices = [1, 2, 3].map((id) => ({ id, endpoint: `${subscription.endpoint}${id}`, ...keys, lastDeliveredAt: since }));
  let updateId = 0, deleteId = 0;
  const fakeDb = {
    select: () => ({ from: (table: unknown) => table === pushSubscriptions ? Promise.resolve(devices) : { where: async () => [row({ firstSeenAt: new Date("2026-10-03T10:00Z") })] } }),
    update: () => ({ set: () => ({ where: async () => { advanced.push(++updateId); } }) }),
    delete: () => ({ where: async () => { deleted.push(++deleteId); } }),
  } as unknown as ReturnType<typeof getDb>;
  const sent: string[] = [];
  webpush.sendNotification = async (sub) => {
    sent.push(sub.endpoint);
    if (sub.endpoint.endsWith("2")) throw { statusCode: 503 };
    if (sub.endpoint.endsWith("3")) throw { statusCode: 410 };
    return { statusCode: 201, body: "", headers: {} };
  };
  try {
    await sendMobileAlerts(fakeDb, () => {});
    assert.equal(sent.length, 3);
    assert.equal(advanced.length, 1);
    assert.equal(deleted.length, 1);
  } finally {
    webpush.sendNotification = originalSend;
    for (const name of ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"]) {
      if (originalEnv[name] === undefined) delete process.env[name]; else process.env[name] = originalEnv[name];
    }
  }
});

test("service worker displays push, tolerates malformed payload, and opens the same-origin dashboard", async () => {
  const handlers: Record<string, (event: unknown) => void> = {};
  const notifications: unknown[] = [];
  const opened: string[] = [];
  const self = {
    addEventListener: (name: string, handler: (event: unknown) => void) => { handlers[name] = handler; },
    registration: { showNotification: async (...args: unknown[]) => { notifications.push(args); } },
    location: { origin: "https://dirabot.example" },
    clients: { matchAll: async () => [], openWindow: async (url: string) => { opened.push(url); } },
  };
  vm.runInNewContext(readFileSync("public/sw.js", "utf8"), { self, URL });
  let pending: Promise<unknown> = Promise.resolve();
  handlers.push({ data: { json: () => ({ title: "New", body: "1 listing", url: "https://attacker.example" }) }, waitUntil: (promise: Promise<unknown>) => { pending = promise; } });
  await pending;
  handlers.push({ data: { json: () => { throw new Error("bad JSON"); } }, waitUntil: (promise: Promise<unknown>) => { pending = promise; } });
  await pending;
  assert.equal(notifications.length, 2);
  handlers.notificationclick({ notification: { close() {} }, waitUntil: (promise: Promise<unknown>) => { pending = promise; } });
  await pending;
  assert.deepEqual(opened, ["/"]);
});
