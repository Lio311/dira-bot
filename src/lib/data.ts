import "server-only";
import { and, desc, gt, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { listings, scrapeRuns } from "@/db/schema";

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
  image: string | null;
  isAgency: boolean | null;
  postedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  previousPrice: number | null;
  alsoOn: { source: string; url: string }[];
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

export async function getDashboardData() {
  const db = getDb();
  const since = new Date(Date.now() - ACTIVE_DAYS * 86_400_000);

  const [rows, dupes, runs] = await Promise.all([
    db
      .select()
      .from(listings)
      .where(and(isNull(listings.duplicateOf), gt(listings.lastSeenAt, since)))
      .orderBy(desc(listings.firstSeenAt))
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
      image: l.images[0] ?? null,
      isAgency: l.isAgency,
      postedAt: l.postedAt?.toISOString() ?? null,
      firstSeenAt: l.firstSeenAt.toISOString(),
      lastSeenAt: l.lastSeenAt.toISOString(),
      previousPrice: prev,
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

  // Server timestamp so relative times render identically on server and client.
  return { listings: view, status, now: Date.now() };
}
