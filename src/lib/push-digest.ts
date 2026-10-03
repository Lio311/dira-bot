import type { Listing } from "../db/schema";

/** No backlog on opt-in; retry changes from our own observations after a failed send. */
export function pushDigest(rows: Listing[], since: Date, until: Date) {
  let fresh = 0, drops = 0, rises = 0;
  for (const row of rows) {
    if (row.duplicateOf != null || row.removedAt != null) continue;
    if (row.firstSeenAt > until) continue;
    if (row.firstSeenAt > since) { fresh++; continue; }
    const history = [...row.priceHistory].sort((a, b) => a.at.localeCompare(b.at));
    for (let i = 1; i < history.length; i++) {
      const entry = history[i];
      const at = new Date(entry.at);
      if (entry.source || entry.undated || at <= since || at > until) continue;
      if (entry.price < history[i - 1].price) drops++;
      if (entry.price > history[i - 1].price) rises++;
    }
  }
  if (!fresh && !drops && !rises) return null;
  return {
    title: "diraBot · עדכון דירות",
    body: [fresh && `${fresh} דירות חדשות`, drops && `${drops} ירידות מחיר`, rises && `${rises} עליות מחיר`].filter(Boolean).join(" · "),
    url: "/", tag: "dirabot-digest",
  };
}
