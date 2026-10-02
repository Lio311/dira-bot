// Price history: shared by the scraper (merging) and the dashboard (summaries).
// No server-only imports, so both sides can use it.

/**
 * One known asking price. Stored as a jsonb array on `listings.price_history`, oldest first.
 * - Our own readings have no `source`: the price we saw on a scrape, `at` = when we saw it change.
 * - `source: "site"` entries are what the listing site itself reports (Yad2's "price before",
 *   Madlan's price history). They fill in what happened before we first saw the ad.
 * - `undated` marks a site entry the site gave without a date (Yad2's "price before" tag). Its `at`
 *   is a placeholder just before the next known entry so it sorts first; never show it as a date.
 */
export interface PriceEntry {
  price: number;
  at: string;
  source?: "site";
  undated?: true;
  /** The first reading of a new ad for a flat whose earlier ad was taken down; the entries before it came from that ad. */
  relisted?: true;
}

/** Site-reported price as a source adapter returns it; `at` null = the site gives no date. */
export interface SitePrice {
  price: number;
  at: string | null;
}

const day = (iso: string) => iso.slice(0, 10);
const validPrice = (p: unknown): p is number => typeof p === "number" && Number.isFinite(p) && p > 0;

/**
 * Folds site-reported prices into the stored history. Stored entries (ours, or site entries
 * recorded earlier) are always kept. A new site entry is skipped when:
 * - dated: the history already has the same price on the same day;
 * - undated: the history already has that price at all (it tells us nothing new).
 * Undated entries are placed 1s before the earliest known entry. The result is sorted by date.
 */
export function mergePriceHistory(stored: readonly PriceEntry[], incoming: readonly SitePrice[] | null | undefined, now = new Date()): PriceEntry[] {
  const out = stored.filter((e) => validPrice(e.price) && typeof e.at === "string").map((e) => ({ ...e }));
  const limit = now.getTime() + 86_400_000;

  const dated: PriceEntry[] = [];
  const undated: number[] = [];
  for (const s of incoming ?? []) {
    if (!validPrice(s.price)) continue;
    const price = Math.round(s.price);
    if (s.at == null) {
      undated.push(price);
      continue;
    }
    const t = new Date(s.at).getTime();
    if (!Number.isFinite(t) || t > limit || t < Date.UTC(2000, 0, 1)) continue;
    dated.push({ price, at: new Date(t).toISOString(), source: "site" });
  }

  for (const e of dated.sort(byDate)) {
    if (out.some((o) => o.price === e.price && day(o.at) === day(e.at))) continue;
    out.push(e);
  }
  out.sort(byDate);

  for (const price of new Set(undated)) {
    if (out.some((o) => o.price === price)) continue;
    const first = out.length ? new Date(out[0].at).getTime() : now.getTime();
    out.unshift({ price, at: new Date(first - 1000).toISOString(), source: "site", undated: true });
  }
  return out;
}

const byDate = (a: PriceEntry, b: PriceEntry) => a.at.localeCompare(b.at);

/** Sorted, with runs of the same price folded into their earliest entry: each point after the first is a change. */
export function pricePoints(history: readonly PriceEntry[]): PriceEntry[] {
  const out: PriceEntry[] = [];
  for (const e of [...history].sort(byDate)) {
    if (out.length && out[out.length - 1].price === e.price) continue;
    out.push(e);
  }
  return out;
}

/** A motivated seller: cut the price this many times, */
export const MOTIVATED_CUTS = 2;
/** or by at least this share of the first known price (one deep cut is enough). */
export const MOTIVATED_DROP = 0.05;

/** How many times the price went down, over the whole history. */
export function countCuts(history: readonly PriceEntry[]): number {
  const pts = pricePoints(history);
  let cuts = 0;
  for (let i = 1; i < pts.length; i++) if (pts[i].price < pts[i - 1].price) cuts++;
  return cuts;
}

type PriceFacts = { price: number | null; priceCuts: number; priceChange: number | null };

/** How far the price fell from the first known price, as a share (0.07 = 7%); 0 when it didn't fall. */
export const dropShare = (l: PriceFacts) =>
  l.price != null && l.priceChange != null && l.priceChange < 0 ? -l.priceChange / (l.price - l.priceChange) : 0;

/**
 * Still below the first known price (a rise back past it cancels the signal), after MOTIVATED_CUTS
 * cuts or a drop of MOTIVATED_DROP or more.
 */
export const isMotivated = (l: PriceFacts) => dropShare(l) > 0 && (l.priceCuts >= MOTIVATED_CUTS || dropShare(l) >= MOTIVATED_DROP);

/** Why a listing counts as motivated, short: "3 cuts" or "−7%". */
export const motivatedReason = (l: PriceFacts) =>
  l.priceCuts >= MOTIVATED_CUTS ? `${l.priceCuts} cuts` : `−${Math.round(dropShare(l) * 100)}%`;

/** The same, spelled out: "3 price cuts" or "price cut 7%". */
export const motivatedReasonLong = (l: PriceFacts) =>
  l.priceCuts >= MOTIVATED_CUTS ? `${l.priceCuts} price cuts` : `price cut ${Math.round(dropShare(l) * 100)}%`;

export interface PriceSummary {
  /** The last `keep` points, oldest first; empty when the price never changed. */
  points: PriceEntry[];
  /** Current price minus the first known price; null when the price never changed. */
  change: number | null;
  /** When the latest change happened; null when unknown (it follows an undated site entry) or none. */
  changedAt: string | null;
  /** The price before the latest change. */
  previous: number | null;
  /** Price cuts over the whole history (not just the kept points). */
  cuts: number;
}

export function summarizePrices(history: readonly PriceEntry[], keep = 12): PriceSummary {
  const pts = pricePoints(history);
  if (pts.length < 2) return { points: [], change: null, changedAt: null, previous: null, cuts: 0 };
  const last = pts[pts.length - 1];
  const before = pts[pts.length - 2];
  return {
    points: pts.slice(-keep),
    change: last.price - pts[0].price,
    changedAt: before.undated ? null : last.at,
    previous: before.price,
    cuts: countCuts(pts),
  };
}
