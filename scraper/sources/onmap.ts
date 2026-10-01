import { jitter, userAgent } from "../lib/browser";
import { BlockedError, type RawListing, type Source } from "../types";

// OnMap's web app talks to a public JSON API. It accepts city and room filters;
// price filtering happens on our side.

interface OnmapItem {
  id?: string;
  slug?: string;
  price?: number | null;
  currency?: string;
  property_type?: string;
  created_at?: string;
  address?: {
    he?: { city_name?: string; neighborhood?: string; street_name?: string; house_number?: string | number | null };
    location?: { lat?: number; lon?: number };
  };
  additional_info?: { rooms?: number | null; area?: { base?: number | null }; floor?: { on_the?: number | null } };
  images?: { gallery?: string; full?: string }[];
  thumbnail?: string;
}

const TYPE_HE: Record<string, string> = {
  apartment: "דירה",
  garden_apartment: "דירת גן",
  duplex: "דופלקס",
  rooftop_apartment: "דירת גג",
  penthouse: "פנטהאוז",
  cottage: "קוטג'",
  triplex: "טריפלקס",
};

async function fetchPage(cityName: string, skip: number) {
  const q = new URLSearchParams({
    option: "buy",
    section: "residence",
    is_mobile: "false",
    $sort: "-search_date",
    $limit: "50",
    $skip: String(skip),
    city: cityName,
  });
  q.append("rooms[]", "4");
  q.append("rooms[]", "5");
  const res = await fetch(`https://phoenix.onmap.co.il/v1/properties/mixed_search?${q}`, {
    headers: {
      "User-Agent": userAgent,
      Accept: "application/json",
      Origin: "https://www.onmap.co.il",
      Referer: "https://www.onmap.co.il/",
    },
  });
  if (res.status === 403 || res.status === 429) throw new BlockedError(`OnMap HTTP ${res.status}`);
  if (!res.ok) throw new Error(`OnMap HTTP ${res.status}`);
  return (await res.json()) as { data: OnmapItem[]; meta?: { hasNextPage?: boolean } };
}

export const onmap: Source = {
  key: "onmap",
  async run({ cities }) {
    const listings: RawListing[] = [];
    const warnings: string[] = [];

    for (const city of cities) {
      try {
        for (let skip = 0; skip < 200; skip += 50) {
          const { data, meta } = await fetchPage(city.onmap, skip);
          for (const i of data) {
            if (!i.id || !i.slug || i.currency && i.currency !== "ILS") continue;
            const a = i.address?.he;
            const street = [a?.street_name, a?.house_number].filter(Boolean).join(" ") || null;
            const type = i.property_type ? TYPE_HE[i.property_type] ?? i.property_type : null;
            listings.push({
              source: "onmap",
              externalId: i.id,
              url: `https://www.onmap.co.il/search/homes/buy?property=${i.slug}`,
              cityText: a?.city_name ?? city.onmap,
              neighborhood: a?.neighborhood ?? null,
              street,
              propertyType: type,
              rooms: i.additional_info?.rooms ?? null,
              sqm: i.additional_info?.area?.base ?? null,
              floor: i.additional_info?.floor?.on_the ?? null,
              price: i.price ?? null,
              lat: i.address?.location?.lat ?? null,
              lng: i.address?.location?.lon ?? null,
              images: (i.images ?? []).map((im) => im.gallery ?? im.full).filter((x): x is string => !!x),
              postedAt: i.created_at ? new Date(i.created_at) : null,
              title: [type, street].filter(Boolean).join(" · ") || null,
            });
          }
          if (!meta?.hasNextPage) break;
          await jitter(1_200, 3_000);
        }
      } catch (e) {
        if (e instanceof BlockedError) throw e;
        warnings.push(`${city.name}: ${(e as Error).message}`);
      }
      await jitter(1_500, 4_000);
    }
    return { listings, warnings };
  },
};
