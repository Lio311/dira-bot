import { CRITERIA } from "../../src/lib/config";
import { apifyFeatures, apifySkipReason, runActor } from "../lib/apify";
import type { RawListing, Source } from "../types";

// Madlan sits behind a PerimeterX "press & hold" challenge that we don't try to defeat.
// Instead we use a maintained Apify actor that serves Madlan data.

const ACTOR = process.env.MADLAN_ACTOR ?? "parsebird/madlan-real-estate-scraper";

interface MadlanItem {
  id?: string;
  url?: string;
  cityHebrew?: string;
  city?: string;
  neighbourhood?: string;
  streetName?: string;
  streetNumber?: string | number;
  price?: number;
  rooms?: number;
  areaSqm?: number;
  floor?: number;
  images?: string[];
  hasAgent?: boolean;
  firstSeen?: string;
  latitude?: number;
  longitude?: number;
}

export const madlan: Source = {
  key: "madlan",
  skip: apifySkipReason,
  async run({ cities }) {
    const perCity = Number(process.env.MADLAN_MAX_PER_CITY ?? 8);
    const warnings: string[] = [];
    const listings: RawListing[] = [];

    const items = await runActor<MadlanItem>(ACTOR, {
      city: cities.map((c) => c.he).join(","),
      dealType: "buy",
      maxItems: perCity,
      minPrice: CRITERIA.minPrice,
      maxPrice: CRITERIA.maxPrice,
      minRooms: CRITERIA.minRooms,
      maxRooms: CRITERIA.maxRooms,
    });
    for (const i of items) {
      if (!i.id || !i.url) continue;
      const street = [i.streetName, i.streetNumber].filter(Boolean).join(" ") || null;
      listings.push({
        source: "madlan",
        externalId: String(i.id),
        url: i.url,
        cityText: i.cityHebrew ?? i.city ?? null,
        neighborhood: i.neighbourhood ?? null,
        street,
        rooms: i.rooms ?? null,
        sqm: i.areaSqm ?? null,
        floor: i.floor ?? null,
        price: i.price ?? null,
        lat: i.latitude ?? null,
        lng: i.longitude ?? null,
        images: i.images ?? [],
        isAgency: i.hasAgent ?? null,
        features: apifyFeatures(i),
        postedAt: i.firstSeen ? new Date(i.firstSeen) : null,
        title: street,
      });
    }
    return { listings, warnings };
  },
};
