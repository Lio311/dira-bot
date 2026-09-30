import { sleep } from "./browser";

// Minimal Apify REST client: start an actor run, wait for it, read its dataset.

const API = "https://api.apify.com/v2";

/**
 * Refuses to start a run once this month's usage nears the account limit, and returns
 * how much a single run may charge. Pay-per-event actors bill for every post and every
 * filter applied, so a run without a cap can burn the whole monthly credit.
 */
async function runBudget(auth: Record<string, string>): Promise<number> {
  const res = await fetch(`${API}/users/me/limits`, { headers: auth });
  if (!res.ok) throw new Error(`Apify limits: HTTP ${res.status}`);
  const { limits, current } = (await res.json()).data as {
    limits: { maxMonthlyUsageUsd: number };
    current: { monthlyUsageUsd: number };
  };
  const budget = Number(process.env.APIFY_BUDGET_USD ?? limits.maxMonthlyUsageUsd * 0.9);
  const left = budget - current.monthlyUsageUsd;
  if (left <= 0.05) {
    throw new Error(`Apify monthly budget reached ($${current.monthlyUsageUsd.toFixed(2)} of $${budget.toFixed(2)})`);
  }
  return Math.min(left, Number(process.env.APIFY_MAX_RUN_USD ?? 0.5));
}

export async function runActor<T>(actorId: string, input: unknown, maxWaitMs = 15 * 60_000): Promise<T[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN is not set");
  const auth = { Authorization: `Bearer ${token}` };
  const maxCharge = await runBudget(auth);

  const start = await fetch(`${API}/acts/${actorId.replace("/", "~")}/runs?maxTotalChargeUsd=${maxCharge.toFixed(2)}`, {
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
