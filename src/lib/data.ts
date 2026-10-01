import "server-only";
import { and, desc, gt, isNotNull, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { listings, scrapeRuns, type FeatureKey } from "@/db/schema";
import { usableImage } from "@/lib/images";
import { getCities } from "@/lib/cities";
import { passcodeRequired } from "@/lib/passcode";

export interface ListingView {
  id: number;
  source: string;
  url: string;
  title: string | null;
  description: string | null;
  city: string;
  priority: number;
  neighborhood: string | null;
  street: string | null;
  propertyType: string | null;
  rooms: number | null;
  sqm: number | null;
  floor: number | null;
  price: number | null;
  lat: number | null;
  lng: number | null;
  image: string | null;
  isAgency: boolean | null;
  /** Amenities the source states; a missing key means unknown. */
  features: Partial<Record<FeatureKey, boolean>>;
  postedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  previousPrice: number | null;
  /** Set when the ad was confirmed taken down ("Not relevant" on the dashboard). */
  removedAt: string | null;
  /** When the owner starred it (favorites); null = not starred. */
  starredAt: string | null;
  alsoOn: { source: string; url: string }[];
}

/** A tracked city as the dashboard needs it (built-in or added from the dashboard). */
export interface CityView {
  key: string;
  name: string;
  he: string;
  priority: number;
  custom: boolean;
}

export interface SourceStatus {
  source: string;
  status: string;
  finishedAt: string | null;
  found: number;
  inserted: number;
  message: string | null;
}

const ACTIVE_DAYS = 30;
/** How long taken-down listings stay visible under "Not relevant". */
const REMOVED_DAYS = 30;

export async function getDashboardData() {
  const db = getDb();
  const since = new Date(Date.now() - ACTIVE_DAYS * 86_400_000);
  const removedSince = new Date(Date.now() - REMOVED_DAYS * 86_400_000);

  const [rows, dupes, runs, cities] = await Promise.all([
    db
      .select()
      .from(listings)
      .where(
        and(
          isNull(listings.duplicateOf),
          or(
            and(isNull(listings.removedAt), gt(listings.lastSeenAt, since)),
            gt(listings.removedAt, removedSince),
            // A star never silently ages out.
            isNotNull(listings.starredAt),
          ),
        ),
      )
      // Starred first so the row limit can't drop them.
      .orderBy(sql`${listings.starredAt} is null`, desc(listings.firstSeenAt))
      .limit(3000),
    db
      .select({ duplicateOf: listings.duplicateOf, source: listings.source, url: listings.url })
      .from(listings)
      .where(and(isNotNull(listings.duplicateOf), gt(listings.lastSeenAt, since))),
    // Latest finished run per source.
    db
      .selectDistinctOn([scrapeRuns.source])
      .from(scrapeRuns)
      .where(sql`${scrapeRuns.status} <> 'running'`)
      .orderBy(scrapeRuns.source, desc(scrapeRuns.startedAt)),
    getCities(db),
  ]);

  const alsoOn = Map.groupBy(dupes, (d) => d.duplicateOf!);

  const view: ListingView[] = rows.map((l) => {
    const history = l.priceHistory;
    const prev = history.length > 1 ? history[history.length - 2].price : null;
    return {
      id: l.id,
      source: l.source,
      url: l.url,
      title: l.title,
      description: l.description ? l.description.slice(0, 400) : null,
      city: l.city,
      priority: l.priority,
      neighborhood: l.neighborhood,
      street: l.street,
      propertyType: l.propertyType,
      rooms: l.rooms,
      sqm: l.sqm,
      floor: l.floor,
      price: l.price,
      lat: l.lat,
      lng: l.lng,
      image: l.images.map((i) => usableImage(i)).find(Boolean) ?? null,
      isAgency: l.isAgency,
      features: l.features,
      postedAt: l.postedAt?.toISOString() ?? null,
      firstSeenAt: l.firstSeenAt.toISOString(),
      lastSeenAt: l.lastSeenAt.toISOString(),
      previousPrice: prev,
      removedAt: l.removedAt?.toISOString() ?? null,
      starredAt: l.starredAt?.toISOString() ?? null,
      alsoOn: (alsoOn.get(l.id) ?? []).map((d) => ({ source: d.source, url: d.url })),
    };
  });

  const status: SourceStatus[] = runs.map((r) => ({
    source: r.source,
    status: r.status,
    finishedAt: r.finishedAt?.toISOString() ?? null,
    found: r.found,
    inserted: r.inserted,
    message: r.message,
  }));

  const cityViews: CityView[] = cities.map((c) => ({ key: c.key, name: c.name, he: c.he, priority: c.priority, custom: !!c.custom }));

  // Server timestamp so relative times render identically on server and client.
  return { listings: view, status, cities: cityViews, passcodeRequired: passcodeRequired(), now: Date.now() };
}
