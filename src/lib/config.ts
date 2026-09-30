// Search criteria and city metadata shared by the scraper and the dashboard.

export const CRITERIA = {
  minRooms: 4,
  maxRooms: 5,
  minPrice: 2_000_000,
  maxPrice: 4_500_000,
} as const;

export type Priority = 1 | 2 | 3 | 4;

export const PRIORITY_LABEL: Record<Priority, string> = {
  1: "Top",
  2: "High",
  3: "Medium",
  4: "Low",
};

export type CityKey =
  | "tel-aviv"
  | "herzliya"
  | "givatayim"
  | "ramat-gan"
  | "savyon"
  | "kiryat-ono"
  | "netanya";

export interface City {
  key: CityKey;
  name: string;
  he: string;
  priority: Priority;
  /** Yad2 numeric city code. */
  yad2: string;
  /** City name as OnMap's API and Homeless' URL expect it. */
  onmap: string;
  homeless: string;
  /** Spellings seen in free text (Facebook posts, Madlan). */
  aliases: string[];
}

export const CITIES: City[] = [
  {
    key: "tel-aviv",
    name: "Tel Aviv",
    he: "תל אביב",
    priority: 1,
    yad2: "5000",
    onmap: "תל אביב יפו",
    homeless: "תל אביב",
    aliases: ["תל אביב", "תל-אביב", "ת\"א", "ת״א", "יפו", "tel aviv", "tel-aviv"],
  },
  {
    key: "herzliya",
    name: "Herzliya",
    he: "הרצליה",
    priority: 2,
    yad2: "6400",
    onmap: "הרצליה",
    homeless: "הרצליה",
    aliases: ["הרצליה", "הרצלייה", "herzliya", "herzeliya"],
  },
  {
    key: "givatayim",
    name: "Givatayim",
    he: "גבעתיים",
    priority: 3,
    yad2: "6300",
    onmap: "גבעתיים",
    homeless: "גבעתיים",
    aliases: ["גבעתיים", "גבעתים", "givatayim"],
  },
  {
    key: "ramat-gan",
    name: "Ramat Gan",
    he: "רמת גן",
    priority: 3,
    yad2: "8600",
    onmap: "רמת גן",
    homeless: "רמת גן",
    aliases: ["רמת גן", "רמת-גן", "ר\"ג", "ר״ג", "ramat gan", "ramat-gan"],
  },
  {
    key: "savyon",
    name: "Savyon",
    he: "סביון",
    priority: 3,
    yad2: "587",
    onmap: "סביון",
    homeless: "סביון",
    aliases: ["סביון", "savyon"],
  },
  {
    key: "kiryat-ono",
    name: "Kiryat Ono",
    he: "קרית אונו",
    priority: 3,
    yad2: "2620",
    onmap: "קרית אונו",
    homeless: "קרית אונו",
    aliases: ["קרית אונו", "קריית אונו", "kiryat ono"],
  },
  {
    key: "netanya",
    name: "Netanya",
    he: "נתניה",
    priority: 4,
    yad2: "7400",
    onmap: "נתניה",
    homeless: "נתניה",
    aliases: ["נתניה", "netanya"],
  },
];

export const CITY_BY_KEY = Object.fromEntries(CITIES.map((c) => [c.key, c])) as Record<CityKey, City>;

const normalizeText = (s: string) =>
  s.toLowerCase().replace(/[֑-ׇ]/g, "").replace(/\s+/g, " ").trim();

const ALIAS_PAIRS = CITIES.flatMap((c) => c.aliases.map((a) => [normalizeText(a), c] as const)).sort(
  (a, b) => b[0].length - a[0].length,
);

/** Resolve a free-text city name to a tracked city; longer aliases win. */
export function matchCity(text: string | null | undefined): City | null {
  if (!text) return null;
  const t = normalizeText(text);
  for (const [alias, city] of ALIAS_PAIRS) if (t.includes(alias)) return city;
  return null;
}

export function inCriteria(l: { rooms: number | null; price: number | null }): boolean {
  if (l.price == null || l.rooms == null) return false;
  return (
    l.rooms >= CRITERIA.minRooms &&
    l.rooms <= CRITERIA.maxRooms &&
    l.price >= CRITERIA.minPrice &&
    l.price <= CRITERIA.maxPrice
  );
}

export const SOURCES = {
  yad2: { name: "Yad2" },
  onmap: { name: "OnMap" },
  homeless: { name: "Homeless" },
  madlan: { name: "Madlan" },
  "fb-group": { name: "FB Group" },
  "fb-marketplace": { name: "Marketplace" },
} as const;

export type SourceKey = keyof typeof SOURCES;
