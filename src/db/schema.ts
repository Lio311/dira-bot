import {
  pgTable,
  serial,
  text,
  integer,
  real,
  doublePrecision,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  boolean,
} from "drizzle-orm/pg-core";

export const listings = pgTable(
  "listings",
  {
    id: serial("id").primaryKey(),
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
    url: text("url").notNull(),
    title: text("title"),
    description: text("description"),
    city: text("city").notNull(),
    priority: integer("priority").notNull(),
    neighborhood: text("neighborhood"),
    street: text("street"),
    propertyType: text("property_type"),
    rooms: real("rooms"),
    sqm: integer("sqm"),
    floor: integer("floor"),
    price: integer("price"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    images: jsonb("images").$type<string[]>().notNull().default([]),
    /** Loose signature (city + street + rooms + sqm) used to spot the same flat on two sites. */
    fingerprint: text("fingerprint"),
    duplicateOf: integer("duplicate_of"),
    isAgency: boolean("is_agency"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    priceHistory: jsonb("price_history").$type<{ price: number; at: string }[]>().notNull().default([]),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("listings_source_external_idx").on(t.source, t.externalId),
    index("listings_fingerprint_idx").on(t.fingerprint),
    index("listings_first_seen_idx").on(t.firstSeenAt),
  ],
);

export const scrapeRuns = pgTable("scrape_runs", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: text("status").notNull(), // ok | blocked | error | skipped
  found: integer("found").notNull().default(0),
  inserted: integer("inserted").notNull().default(0),
  message: text("message"),
});

export type Listing = typeof listings.$inferSelect;
export type NewListing = typeof listings.$inferInsert;
export type ScrapeRun = typeof scrapeRuns.$inferSelect;
