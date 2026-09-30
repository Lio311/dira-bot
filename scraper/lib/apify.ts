import { sleep } from "./browser";

// Minimal Apify REST client: start an actor run, wait for it, read its dataset.

const API = "https://api.apify.com/v2";

export async function runActor<T>(actorId: string, input: unknown, maxWaitMs = 15 * 60_000): Promise<T[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN is not set");
  const auth = { Authorization: `Bearer ${token}` };

  const start = await fetch(`${API}/acts/${actorId.replace("/", "~")}/runs`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!start.ok) throw new Error(`Apify ${actorId} start: HTTP ${start.status} ${(await start.text()).slice(0, 200)}`);
  let run = (await start.json()).data as { id: string; status: string; defaultDatasetId: string };

  const deadline = Date.now() + maxWaitMs;
  while (!["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(run.status)) {
    if (Date.now() > deadline) throw new Error(`Apify ${actorId} still ${run.status} after ${maxWaitMs / 60_000} min`);
    const res = await fetch(`${API}/actor-runs/${run.id}?waitForFinish=60`, { headers: auth });
    if (res.ok) run = (await res.json()).data;
    else await sleep(5_000);
  }
  if (run.status !== "SUCCEEDED") throw new Error(`Apify ${actorId} run ${run.status}`);

  const items = await fetch(`${API}/datasets/${run.defaultDatasetId}/items?clean=true&format=json`, { headers: auth });
  if (!items.ok) throw new Error(`Apify dataset: HTTP ${items.status}`);
  return (await items.json()) as T[];
}

/**
 * Apify sources cost money per item, so by default they run once a day (on the first
 * cron slot, 00:00 UTC) instead of every 8 hours. APIFY_EVERY_RUN=1 overrides.
 */
export function apifySkipReason(): string | null {
  if (!process.env.APIFY_TOKEN) return "APIFY_TOKEN not set";
  if (process.env.APIFY_EVERY_RUN === "1" || process.env.FORCE_APIFY === "1") return null;
  const hour = new Date().getUTCHours();
  return hour < 8 ? null : "Apify sources run once a day (00:00 UTC slot)";
}
