/* Push only: do not cache pages or intercept dashboard requests. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data?.json() ?? {}; } catch { /* Always show a visible notification. */ }
  event.waitUntil(self.registration.showNotification(data.title || "diraBot", {
    body: data.body || "יש עדכון חדש בדירות שלך", icon: "/icon-192.png", badge: "/icon-192.png",
    tag: data.tag || "dirabot-digest", dir: "rtl", lang: "he", data: { url: "/" },
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.navigate("/");
        return client.focus();
      }
    }
    return self.clients.openWindow("/");
  })());
});
