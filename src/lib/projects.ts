import { CRITERIA } from "./config";
import { ils } from "./format";

export interface ProjectOffer {
  rooms: number;
  price: number | null;
  priceKind: "from" | "exact" | "unknown";
  /** Wording from the project page, retained so room/price attribution is reviewable. */
  evidence?: string;
}
export interface ProjectInfo {
  developer: string;
  offers: ProjectOffer[];
  generalPrice: number | null;
  generalPriceKind: "from" | "exact" | "unknown";
  generalPriceEvidence?: string;
  stage: "marketing" | "construction" | "planning" | "completed" | "unknown";
  stageEvidence?: string;
  availability: "marketing" | "sold-out" | "unknown";
  locationPrecision: "address" | "street" | "city" | "unknown";
  locationSource?: string;
  checkedAt: string;
}

export type Inventory = "apartments" | "projects" | "both";
export const PROJECT_STAGE = { marketing: "On sale", construction: "Under construction", planning: "Planning / awaiting permit", completed: "Construction complete", unknown: "Stage not published" } as const;
export function projectPriceLines(p: ProjectInfo): string[] {
  const lines = p.offers.map((o) => `${o.rooms} rooms — ${o.price == null ? "Price not published" : `${o.priceKind === "from" ? "From " : ""}${ils(o.price)}`}`);
  if (p.generalPrice != null) lines.push(`${p.generalPriceKind === "from" ? "From " : ""}${ils(p.generalPrice)} — General starting price; room type not specified`);
  return lines;
}
export function projectLocationLabel(p: ProjectInfo): string {
  return p.locationPrecision === "address" ? "Address location" : p.locationPrecision === "street" ? "Approximate street location" : p.locationPrecision === "city" ? "Approximate city location" : "Project location not verified";
}
/** A project-level minimum never proves that a relevant apartment is within budget. */
export function projectFits(p: ProjectInfo): boolean {
  if (p.availability === "sold-out") return false;
  return p.offers.some((o) => o.rooms >= CRITERIA.minRooms && o.rooms <= CRITERIA.maxRooms &&
    (o.price == null || (o.priceKind === "from" ? o.price <= CRITERIA.maxPrice : o.price >= CRITERIA.minPrice && o.price <= CRITERIA.maxPrice)));
}
export function projectMatches(p: ProjectInfo, rooms: readonly number[], range: readonly [number, number] | null): boolean {
  return p.offers.some((o) => (!rooms.length || rooms.includes(o.rooms)) &&
    (!range || (o.price != null && (o.priceKind === "from" ? o.price <= range[1] : o.price >= range[0] && o.price <= range[1]))));
}
export function inventoryMatches(l: { project?: ProjectInfo | null }, inventory: Inventory): boolean {
  return inventory === "both" || (inventory === "projects" ? !!l.project : !l.project);
}
/** Only a price explicitly attached to 4–5 rooms can be used for sorting. Never use it for apartment statistics. */
export function projectSortPrice(p: ProjectInfo): number | null {
  const prices = p.offers.flatMap((o) => o.price == null ? [] : [o.price]);
  return prices.length ? Math.min(...prices) : null;
}
