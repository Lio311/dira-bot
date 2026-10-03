import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { matchCity, type City } from "../../src/lib/config";
import type { ProjectInfo } from "../../src/lib/projects";
import type { RawListing } from "../types";
import { sleep } from "./browser";

type Location = { lat: number; lng: number; precision: ProjectInfo["locationPrecision"]; at: string };
type Feature = { geometry?: { coordinates?: number[] }; properties?: { city?: string; name?: string; street?: string; housenumber?: string; type?: string; countrycode?: string } };
const norm = (s: string) => s.replace(/(?:רחוב|רח[׳']|שדרות|שד[׳'])/g, "").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
/** Accept only the requested city and street, never a geocoder's nearby suggestion. */
export function verifiedLocation(feature: Feature, city: City, street: string | null, cities: readonly City[]): Omit<Location, "at"> | null {
  const [lng, lat] = feature.geometry?.coordinates || [];
  const p = feature.properties;
  if (!p || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < 29 || lat > 33.5 || lng < 34 || lng > 36) return null;
  if (matchCity(p.city || (p.type === "city" ? p.name : ""), cities)?.key !== city.key) return null;
  if (!street) return p.type === "city" ? { lat, lng, precision: "city" } : null;
  const streetName = street.replace(/\d[\d\s,־–-]*$/, "").trim();
  if (norm(p.street || (p.type === "street" ? p.name || "" : "")) !== norm(streetName)) return null;
  const number = street.match(/\d+/)?.[0];
  const precise = !!number && p.housenumber === number;
  return { lat, lng, precision: precise ? "address" : "street" };
}

/** Small, single-threaded, cached geocoding; never performed during a page view. */
export async function locateProjects(rows: RawListing[], cities: readonly City[]): Promise<string[]> {
  const path = process.env.PROJECT_GEOCODE_CACHE || ".project-geocode-cache.json";
  let cache: Record<string, Location | { at: string }> = {};
  if (existsSync(path)) { try { cache = JSON.parse(readFileSync(path, "utf8")); } catch {} }
  const warnings: string[] = [];
  let requests = 0;
  for (const row of rows) {
    const city = matchCity(row.cityText, cities);
    if (!city || !row.project) continue;
    // Built-in city centres already exist; look up a custom city only once if no street is known.
    if (!row.street && row.lat != null) continue;
    const key = `${city.key}|${row.street || "city"}`;
    let location = cache[key];
    if (!location || (!("lat" in location) && Date.now() - new Date(location.at).getTime() > 30 * 86_400_000)) {
      if (requests >= 15) continue;
      await sleep(1200);
      requests++;
      try {
        const endpoint = new URL(process.env.PROJECT_GEOCODER_URL || "https://photon.komoot.io/api/");
        const street = row.street?.replace(/(\d+)[־–-]\d+/, "$1");
        endpoint.search = new URLSearchParams({ q: [street, city.he, "Israel"].filter(Boolean).join(", "), limit: "5", bbox: "34,29,36,33.5" }).toString();
        const response = await fetch(endpoint, { signal: AbortSignal.timeout(15_000), headers: { "User-Agent": "diraBot/1.0 (+https://github.com/Lio311/dira-bot)" } });
        if (!response.ok) { warnings.push(`Address lookup unavailable (HTTP ${response.status}); keeping approximate locations`); break; }
        const data: { features?: Feature[] } = await response.json();
        const found = data.features?.map((f) => verifiedLocation(f, city, row.street || null, cities)).find(Boolean);
        location = found ? { ...found, at: new Date().toISOString() } : { at: new Date().toISOString() };
        cache[key] = location;
      } catch { warnings.push("Address lookup unavailable; keeping approximate locations"); break; }
    }
    if (location && "lat" in location) {
      row.lat = location.lat; row.lng = location.lng;
      row.project.locationPrecision = location.precision;
      row.project.locationSource = "OpenStreetMap / Photon";
    }
  }
  writeFileSync(path, JSON.stringify(cache));
  return warnings;
}
