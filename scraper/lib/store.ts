import { and, desc, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { CITIES, CRITERIA, inCriteria, matchCity, type City } from "../../src/lib/config";
import type { getDb } from "../../src/db/client";
import { listings, type Listing, type NewListing } from "../../src/db/schema";
import { projectFits } from "../../src/lib/projects";
import { mergePriceHistory, type PriceEntry, type SitePrice } from "../../src/lib/price-history";
import type { RawListing } from "../types";

type Db = ReturnType<typeof getDb>;

/** A row ready to save, plus the prices the site itself reports (merged into the stored history on save). */
export type Normalized = NewListing & { sitePrices?: SitePrice[] };

/** City match + criteria filter. Returns null for listings we don't track. */
export function normalize(r: RawListing, cities: readonly City[] = CITIES): Normalized | null {
  const city = matchCity(r.cityText, cities);
  if (!city) return null;
  const rooms = r.rooms != null && Number.isFinite(r.rooms) ? r.rooms : null;
  const price = r.price != null && Number.isFinite(r.price) ? Math.round(r.price) : null;

  const fits = r.project ? projectFits(r.project) : r.lenientRooms && rooms == null
    ? price != null && price >= CRITERIA.minPrice && price <= CRITERIA.maxPrice
    : inCriteria({ rooms, price });
  if (!fits) return null;

  const street = r.street?.trim() || null;
  const postedAt = r.postedAt && !isNaN(r.postedAt.getTime()) ? r.postedAt : null;
  return {
    source: r.source,
    externalId: r.externalId,
    url: r.url,
    title: r.title ?? null,
    description: r.description ?? null,
    city: city.key,
    priority: city.priority,
    neighborhood: r.neighborhood?.trim() || null,
    street,
    propertyType: r.propertyType ?? null,
    project: r.project ?? null,
    rooms,
    sqm: r.sqm ? Math.round(r.sqm) : null,
    floor: r.floor ?? null,
    price,
    images: (r.images ?? []).slice(0, 8),
    ...coords(r.lat, r.lng),
    isAgency: r.isAgency ?? null,
    features: r.features ?? {},
    postedAt,
    fingerprint: r.fingerprint ?? fingerprint(city.key, street, rooms, r.sqm ?? null),
    // An undated site price (Yad2's "price before") dates from the ad's posting when we know it.
    ...(r.priceHistory?.length && {
      sitePrices: r.priceHistory.map((p) => (p.at == null && postedAt ? { ...p, at: postedAt.toISOString() } : p)),
    }),
  };
}

/** Keep coordinates only when they fall inside Israel's bounding box. */
function coords(lat: number | null | undefined, lng: number | null | undefined) {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return {};
  if (lat < 29 || lat > 33.5 || lng < 34 || lng > 36) return {};
  return { lat, lng };
}

/**
 * Same flat on two sites usually shares street + house number + rooms, and size within
 * a few m². Without a house number the match is too loose, so no fingerprint.
 */
function fingerprint(city: string, street: string | null, rooms: number | null, sqm: number | null) {
  if (!street || !/\d/.test(street) || rooms == null) return null;
  const s = street.replace(/["'׳״\-.,]/g, "").replace(/\s+/g, " ").trim();
  const size = sqm ? Math.round(sqm / 5) * 5 : "x";
  return `${city}|${s}|${rooms}|${size}`;
}

/**
 * The main listing (not itself a duplicate) sharing this fingerprint, live ones first. The fingerprint
 * ignores the floor, so two known, different floors are different flats in the same building.
 */
async function findTwin(db: Db, fp: string, floor: number | null) {
  const twins = await db
    .select({ id: listings.id, floor: listings.floor, removedAt: listings.removedAt, priceHistory: listings.priceHistory })
    .from(listings)
    .where(and(eq(listings.fingerprint, fp), isNull(listings.duplicateOf)))
    .orderBy(sql`${listings.removedAt} is not null`, desc(listings.lastSeenAt))
    .limit(5);
  return twins.find((t) => floor == null || t.floor == null || t.floor === floor) ?? null;
}

/** Makes `to` the main listing for `from` and everything that pointed at `from`. */
async function adoptDuplicates(db: Db, from: number, to: number) {
  await db.update(listings).set({ duplicateOf: to }).where(and(eq(listings.duplicateOf, from), ne(listings.id, to)));
  await db.update(listings).set({ duplicateOf: to }).where(eq(listings.id, from));
}

/**
 * A main listing confirmed taken down can still be live on another site (a duplicate kept behind it).
 * The most recently seen live duplicate takes over, so the flat stays on the board. Returns how many.
 */
export async function promoteLiveDuplicates(db: Db) {
  const primary = alias(listings, "primary");
  const rows = await db
    .select({ id: listings.id, primaryId: primary.id })
    .from(listings)
    .innerJoin(primary, eq(listings.duplicateOf, primary.id))
    .where(and(isNotNull(primary.removedAt), isNull(listings.removedAt)))
    .orderBy(desc(listings.lastSeenAt));
  const heirs = new Map<number, number>();
  for (const r of rows) if (!heirs.has(r.primaryId)) heirs.set(r.primaryId, r.id);
  for (const [from, to] of heirs) {
    await db.update(listings).set({ duplicateOf: null }).where(eq(listings.id, to));
    await adoptDuplicates(db, from, to);
  }
  return heirs.size;
}

/** A price we saw change between two scrapes: `from` is the price we had stored. */
export interface PriceChange {
  listing: Listing;
  from: number;
}

export async function saveListings(db: Db, batch: Normalized[]) {
  const unique = [...new Map(batch.map((l) => [`${l.source}:${l.externalId}`, l])).values()];
  const inserted: Listing[] = [];
  const priceDrops: PriceChange[] = [];
  const priceRises: PriceChange[] = [];
  if (!unique.length) return { inserted, priceDrops, priceRises };

  const now = new Date();
  const bySource = Map.groupBy(unique, (l) => l.source);

  for (const [source, items] of bySource) {
    const existing = await db
      .select()
      .from(listings)
      .where(and(eq(listings.source, source), inArray(listings.externalId, items.map((i) => i.externalId))));
    const known = new Map(existing.map((e) => [e.externalId, e]));

    for (const { sitePrices, ...item } of items) {
      const prev = known.get(item.externalId);
      if (!prev) {
        const twin = item.fingerprint ? await findTwin(db, item.fingerprint, item.floor ?? null) : null;
        // A live twin is the same flat on another site: this ad hides behind it. A taken-down twin
        // means the flat was re-listed: this ad takes over, carrying the old ad's prices.
        const relisted = twin?.removedAt ? twin : null;
        const reading: PriceEntry[] = item.price ? [{ price: item.price, at: now.toISOString(), ...(relisted && { relisted: true as const }) }] : [];
        const [row] = await db
          .insert(listings)
          .values({
            ...item,
            duplicateOf: twin && !relisted ? twin.id : null,
            priceHistory: mergePriceHistory([...(relisted?.priceHistory ?? []), ...reading], sitePrices, now),
          })
          .onConflictDoNothing()
          .returning();
        if (row && relisted) await adoptDuplicates(db, relisted.id, row.id);
        if (row) inserted.push(row);
        continue;
      }

      const priceChanged = item.price != null && item.price !== prev.price;
      // Site-reported prices first (they describe the past), then our own reading of a change.
      const merged = mergePriceHistory(prev.priceHistory, sitePrices, now);
      if (priceChanged) merged.push({ price: item.price!, at: now.toISOString() });
      const historyChanged = merged.length !== prev.priceHistory.length;
      const [row] = await db
        .update(listings)
        .set({
          lastSeenAt: now,
          // Seen again, so not taken down after all (or re-listed).
          removedAt: null,
          url: item.url,
          ...(item.project && { project: item.project, title: item.title, description: item.description, street: item.street }),
          images: item.images?.length ? item.images : prev.images,
          sqm: item.sqm ?? prev.sqm,
          lat: item.lat ?? prev.lat,
          lng: item.lng ?? prev.lng,
          // New readings add to (or correct) what we know; keys this run didn't see stay.
          features: { ...prev.features, ...item.features },
          ...(priceChanged && { price: item.price }),
          ...(historyChanged && { priceHistory: merged }),
        })
        .where(eq(listings.id, prev.id))
        .returning();
      if (priceChanged && prev.price && !row.duplicateOf) {
        (item.price! < prev.price ? priceDrops : priceRises).push({ listing: row, from: prev.price });
      }
    }
  }
  return { inserted, priceDrops, priceRises };
}
