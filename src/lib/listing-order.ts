type DatedListing = { id: number; postedAt: string | null; firstSeenAt: string };

/** Prefer the source's publication date; undated projects use their discovery date. */
export function listingPublishedTime(listing: DatedListing): number {
  const published = listing.postedAt ? Date.parse(listing.postedAt) : NaN;
  return Number.isFinite(published) ? published : Date.parse(listing.firstSeenAt);
}

export function newestFirst(a: DatedListing, b: DatedListing): number {
  return listingPublishedTime(b) - listingPublishedTime(a) || b.id - a.id;
}
