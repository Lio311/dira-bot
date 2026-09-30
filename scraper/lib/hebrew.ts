// Heuristics for pulling structured fields out of free-text Hebrew listing posts
// (Facebook groups / Marketplace descriptions).

const WORD_ROOMS: Record<string, number> = {
  "ארבעה": 4,
  "ארבע": 4,
  "חמישה": 5,
  "חמש": 5,
  "ארבעה וחצי": 4.5,
  "ארבע וחצי": 4.5,
};

const clean = (s: string) => s.replace(/[‎‏‪-‮]/g, "");

export function parseRooms(text: string): number | null {
  const t = clean(text);
  const m = t.match(/(\d(?:[.,]5)?)\s*(?:חדרים|חדר|חד['׳"]?|rooms?)(?![א-ת])/i);
  if (m) return parseFloat(m[1].replace(",", "."));
  const w = t.match(/(ארבעה וחצי|ארבע וחצי|ארבעה|ארבע|חמישה|חמש)\s+חדרים/);
  if (w) return WORD_ROOMS[w[1]];
  return null;
}

export function parseSqm(text: string): number | null {
  const m = clean(text).match(/(\d{2,3})\s*(?:מ["״']?ר|מטר(?:ים)?|מ״ר|sqm|m²|מר)(?![א-ת])/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n >= 30 && n <= 600 ? n : null;
}

/**
 * Finds the asking price. Accepts "3,450,000", "3.450.000 ₪", "₪3450000",
 * "3.45 מיליון", "3.4M", "3,450 אלף". Values outside a plausible sale range are ignored,
 * which also filters out monthly rents and phone numbers.
 */
export function parsePrice(text: string): number | null {
  const t = clean(text);
  const candidates: number[] = [];

  for (const m of t.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:מיליון|מליון|מיל['׳]|M\b)/g)) {
    candidates.push(Math.round(parseFloat(m[1].replace(",", ".")) * 1_000_000));
  }
  for (const m of t.matchAll(/(\d{1,2}[.,]?\d{3})\s*(?:אלף|K\b)/gi)) {
    candidates.push(parseInt(m[1].replace(/[.,]/g, ""), 10) * 1000);
  }
  // "3,450,000" / "3.450.000" read as prices on their own. Not preceded by a digit or
  // dash, so the tail of "054-3450000" never matches.
  for (const m of t.matchAll(/(?<![\d\-–])(\d{1,2}[.,]\d{3}[.,]\d{3})(?![\d])/g)) {
    candidates.push(parseInt(m[1].replace(/[.,]/g, ""), 10));
  }
  // A bare 7-digit number is only a price next to a currency sign or the word "מחיר";
  // otherwise it's almost always a phone number.
  const CUR = String.raw`(?:₪|ש["״]ח|שח|nis|ils|שקל)`;
  const bare = new RegExp(String.raw`(?:${CUR}|מחיר[^\d\n]{0,12})\s*(?<![\d\-–])(\d{7})(?!\d)|(?<![\d\-–])(\d{7})(?!\d)\s*${CUR}`, "gi");
  for (const m of t.matchAll(bare)) candidates.push(parseInt(m[1] ?? m[2], 10));

  const plausible = candidates.filter((n) => n >= 500_000 && n <= 30_000_000);
  return plausible[0] ?? null;
}

const RENT = /להשכרה|שכירות|לשכירות|לחודש|שכ["״]ד|סאבלט|sublet|for rent/i;
const SALE = /למכירה|מוכר(?:ים|ת)?|מכירה|for sale|ללא תיווך|בבלעדיות/i;

export function isSalePost(text: string): boolean {
  const t = clean(text);
  if (RENT.test(t) && !SALE.test(t)) return false;
  return SALE.test(t) || parsePrice(t) != null;
}

/** Stable signature of a post's wording, so the same ad cross-posted to several groups dedupes. */
export function textFingerprint(text: string): string {
  const norm = clean(text).replace(/[^\p{L}\p{N}]+/gu, "").slice(0, 160);
  let h = 5381;
  for (let i = 0; i < norm.length; i++) h = ((h << 5) + h + norm.charCodeAt(i)) | 0;
  return `txt|${(h >>> 0).toString(36)}`;
}

export function firstLine(text: string, max = 90): string {
  const line = clean(text).split(/\n/).map((s) => s.trim()).find(Boolean) ?? "";
  return line.length > max ? line.slice(0, max - 1) + "…" : line;
}
