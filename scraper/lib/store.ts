import { and, eq, inArray, isNull } from "drizzle-orm";
import { CRITERIA, inCriteria, matchCity } from "../../src/lib/config";
import type { getDb } from "../../src/db/client";
import { listings, type Listing, type NewListing } from "../../src/db/schema";
import type { RawListing } from "../types";

type Db = ReturnType<typeof getDb>;

/** City match + criteria filter. Returns null for listings we don't track. */
export function normalize(r: RawListing): NewListing | null {
  const city = matchCity(r.cityText);
  if (!city) return null;
  const rooms = r.rooms != null && Number.isFinite(r.rooms) ? r.rooms : null;
  const price = r.price != null && Number.isFinite(r.price) ? Math.round(r.price) : null;

  const fits = r.lenientRooms && rooms == null
    ? price != null && price >= CRITERIA.minPrice && price <= CRITERIA.maxPrice
    : inCriteria({ rooms, price });
  if (!fits) return null;

  const street = r.street?.trim() || null;
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
    rooms,
    sqm: r.sqm ? Math.round(r.sqm) : null,
    floor: r.floor ?? null,
    price,
    images: (r.images ?? []).slice(0, 8),
    ...coords(r.lat, r.lng),
    isAgency: r.isAgency ?? null,
    postedAt: r.postedAt && !isNaN(r.postedAt.getTime()) ? r.postedAt : null,
    fingerprint: r.fingerprint ?? fingerprint(city.key, street, rooms, r.sqm ?? null),
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

export interface PriceDrop {
  listing: Listing;
  from: number;
}

export async function saveListings(db: Db, batch: NewListing[]) {
  const unique = [...new Map(batch.map((l) => [`${l.source}:${l.externalId}`, l])).values()];
  const inserted: Listing[] = [];
  const priceDrops: PriceDrop[] = [];
  if (!unique.length) return { inserted, priceDrops };

  const now = new Date();
  const bySource = Map.groupBy(unique, (l) => l.source);

  for (const [source, items] of bySource) {
    const existing = await db
      .select()
      .from(listings)
      .where(and(eq(listings.source, source), inArray(listings.externalId, items.map((i) => i.externalId))));
    const known = new Map(existing.map((e) => [e.externalId, e]));

    for (const item of items) {
      const prev = known.get(item.externalId);
      if (!prev) {
        let duplicateOf: number | null = null;
        if (item.fingerprint) {
          const [twin] = await db
            .select({ id: listings.id })
            .from(listings)
            .where(and(eq(listings.fingerprint, item.fingerprint), isNull(listings.duplicateOf)))
            .limit(1);
          duplicateOf = twin?.id ?? null;
        }
        const [row] = await db
          .insert(listings)
          .values({
            ...item,
            duplicateOf,
            priceHistory: item.price ? [{ price: item.price, at: now.toISOString() }] : [],
          })
          .onConflictDoNothing()
          .returning();
        if (row) inserted.push(row);
        continue;
      }

      const priceChanged = item.price != null && item.price !== prev.price;
      const [row] = await db
        .update(listings)
        .set({
          lastSeenAt: now,
          // Seen again, so not taken down after all (or re-listed).
          removedAt: null,
          url: item.url,
          images: item.images?.length ? item.images : prev.images,
          sqm: item.sqm ?? prev.sqm,
          lat: item.lat ?? prev.lat,
          lng: item.lng ?? prev.lng,
          ...(priceChanged && {
            price: item.price,
            priceHistory: [...prev.priceHistory, { price: item.price!, at: now.toISOString() }],
          }),
        })
        .where(eq(listings.id, prev.id))
        .returning();
      if (priceChanged && prev.price && item.price! < prev.price && !row.duplicateOf) {
        priceDrops.push({ listing: row, from: prev.price });
      }
    }
  }
  return { inserted, priceDrops };
}
