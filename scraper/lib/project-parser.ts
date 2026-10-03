import { matchCity, type City } from "../../src/lib/config";
import { projectFits, type ProjectInfo, type ProjectOffer } from "../../src/lib/projects";
import { parsePrice } from "./hebrew";
import type { RawListing } from "../types";

export interface ProjectPage {
  title: string;
  identity: string;
  text: string;
  image: string | null;
  street?: string | null;
  stageText?: string;
}
const relevant = (n: number) => n >= 4 && n <= 5;
const ROOM_LIST = /(?<![\d])([2-7](?:\.5)?(?:\s*(?:[-–,\/]|ו(?:־|-)?)\s*[2-7](?:\.5)?)*)\s*(?:חדרים|חד[׳'״"]?|rooms?)(?![א-ת])/gi;
export function roomTypes(text: string): number[] {
  const found = new Set<number>();
  for (const m of text.matchAll(ROOM_LIST)) {
    const ns = [...m[1].matchAll(/\d(?:\.5)?/g)].map((x) => Number(x[0]));
    if (/[-–]/.test(m[1]) && ns.length === 2) {
      for (const n of [4, 5]) if (n >= Math.min(...ns) && n <= Math.max(...ns)) found.add(n);
    } else ns.filter(relevant).forEach((n) => found.add(n));
  }
  if (/(?:ארבע|ארבעה)\s+חדרים/.test(text)) found.add(4);
  if (/(?:חמש|חמישה)\s+חדרים/.test(text)) found.add(5);
  return [...found].sort((a, b) => a - b);
}

export function parseProjectOffers(text: string): Pick<ProjectInfo, "offers" | "generalPrice" | "generalPriceKind" | "generalPriceEvidence"> {
  const types = roomTypes(text);
  const offers: ProjectOffer[] = types.map((rooms) => ({ rooms, price: null, priceKind: "unknown" }));
  let generalPrice: number | null = null;
  let generalPriceKind: ProjectInfo["generalPriceKind"] = "unknown";
  let generalPriceEvidence: string | undefined;
  // Prices are attributed only within one sentence/line. Adjacent room types, phone
  // numbers, financing percentages and prices of other units must never be joined.
  for (const line of text.split(/\n|[;!?]|\.(?!\d)/).map((s) => s.trim()).filter(Boolean)) {
    const price = parsePrice(line.replace(/(?<=[א-ת])[-־–](?=\d)/g, " "));
    if (price == null || !/(?:₪|ש[״"]?ח|שקל|מיליון|מליון|מחיר|החל\s*מ)/.test(line)) continue;
    const kind = /החל\s*מ|starting\s*(?:at|from)|from\s*₪/i.test(line) ? "from" : "exact";
    const mentions = [...line.matchAll(ROOM_LIST)];
    const allNumbers = mentions.flatMap((m) => [...m[1].matchAll(/\d(?:\.5)?/g)].map((n) => Number(n[0])));
    if (allNumbers.length === 1 && relevant(allNumbers[0])) {
      const o = offers.find((o) => o.rooms === allNumbers[0]);
      if (o && (o.price == null || price < o.price)) Object.assign(o, { price, priceKind: kind, evidence: line.slice(0, 350) });
    } else if (!allNumbers.length || (allNumbers.length > 1 && allNumbers.some(relevant))) {
      if (generalPrice == null || price < generalPrice) {
        generalPrice = price;
        generalPriceKind = kind;
        generalPriceEvidence = line.slice(0, 350);
      }
    }
  }
  return { offers, generalPrice, generalPriceKind, generalPriceEvidence };
}

export const CITY_CENTERS: Record<string, [number, number]> = {
  "tel-aviv": [32.0853, 34.7818], herzliya: [32.1663, 34.8433], givatayim: [32.0696, 34.8117],
  "ramat-gan": [32.0823, 34.8107], savyon: [32.0474, 34.8774], "kiryat-ono": [32.0622, 34.8565],
  raanana: [32.1848, 34.8713], "ramat-hasharon": [32.1395, 34.8403], netanya: [32.3215, 34.8532],
};
export function projectStage(text: string): ProjectInfo["stage"] {
  if (/סטטוס תכנוני\s*:?\s*ביצוע/.test(text)) return "construction";
  if (/בתכנון|בקשה להיתר|לפני היתר|טרם.*היתר/.test(text)) return "planning";
  if (/הבנייה הושלמה|הבניה הסתיימה|אכלוס מיידי|מאוכלס/.test(text)) return "completed";
  if (/בבנייה|בבניה|בביצוע|סטטוס תכנוני\s*:?\s*ביצוע/.test(text)) return "construction";
  if (/בשיווק|נפתח למכירה|הרשמה מוקדמת|PRESALE/i.test(text)) return "marketing";
  return "unknown";
}
export function parseProject(page: ProjectPage, url: string, developer: string, cities: readonly City[]): RawListing | null {
  // Resolve only from project identity, never a site's navigation or "other projects".
  const city = matchCity(page.title, cities) || matchCity(page.identity, cities);
  if (!city || /להשכרה|השכרה ארוכת|משרדים|מרכז מסחרי/.test(page.title)) return null;
  const parsed = parseProjectOffers(page.text);
  if (!parsed.offers.length) return null;
  const stageText = page.stageText || page.text;
  const availability = /אזל המלאי|כל הדירות נמכרו|השיווק הסתיים|sold out/i.test(stageText) ? "sold-out" : /בשיווק|נפתח למכירה|דירות.*למכירה|הרשמה מוקדמת|PRESALE/i.test(stageText) ? "marketing" : "unknown";
  const center = CITY_CENTERS[city.key];
  const project: ProjectInfo = {
    developer, ...parsed, stage: projectStage(stageText), stageEvidence: page.stageText?.slice(0, 350), availability,
    locationPrecision: center ? "city" : "unknown", locationSource: center ? "City centre (approximate)" : undefined, checkedAt: new Date().toISOString(),
  };
  if (!projectFits(project)) return null;
  const canonical = new URL(url); canonical.search = ""; canonical.hash = "";
  return {
    source: "projects", externalId: canonical.href, url: canonical.href, cityText: city.he,
    title: page.title, description: page.text.slice(0, 2000), street: page.street || null,
    propertyType: "פרויקט מקבלן", project, rooms: null, price: null,
    lat: center?.[0] ?? null, lng: center?.[1] ?? null, images: page.image ? [page.image] : [],
    fingerprint: `project|${city.key}|${developer}|${page.title.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase()}`,
  };
}
