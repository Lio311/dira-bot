import type { SourceKey } from "../src/lib/config";

/** What every source adapter returns before city matching and criteria filtering. */
export interface RawListing {
  source: SourceKey;
  externalId: string;
  url: string;
  cityText: string | null;
  title?: string | null;
  description?: string | null;
  neighborhood?: string | null;
  street?: string | null;
  propertyType?: string | null;
  rooms: number | null;
  sqm?: number | null;
  floor?: number | null;
  price: number | null;
  images?: string[];
  lat?: number | null;
  lng?: number | null;
  isAgency?: boolean | null;
  postedAt?: Date | null;
  /** Free-text sources can't always state rooms; accept a missing value when the rest fits. */
  lenientRooms?: boolean;
  /** Overrides the address-based duplicate signature (free-text sources). */
  fingerprint?: string | null;
}

export class BlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedError";
  }
}

export interface SourceResult {
  listings: RawListing[];
  /** Non-fatal problems, e.g. one city page failed. Shown on the dashboard status strip. */
  warnings: string[];
}

export type Source = {
  key: SourceKey;
  /** Returns a reason when the source can't run in this environment (missing token, disabled). */
  skip?: () => string | null;
  run: () => Promise<SourceResult>;
};
