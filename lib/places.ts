/**
 * Public-venue lookup for date-spot suggestions (PRD §5.5, Prompt 11).
 *
 * SERVER ONLY. `GOOGLE_PLACES_API_KEY` must never reach the browser — a
 * maps key visible in a page is billable by anyone who finds it. Import this
 * from server actions only.
 *
 * A lookup, explicitly not a curated venue directory: the directory is
 * deferred (PRD §5.5) and partnered venues are in the "LATER" list.
 *
 * Two product rules are enforced here rather than left to the query string:
 *
 *   1. Only public, daytime-appropriate venue types are ever requested. Bars,
 *      lounges, night clubs and casinos are not in the allowlist and are not
 *      reachable by passing a different argument — the public-venue nudge is
 *      a soft safety signal, so it cannot depend on remembering to omit them.
 *   2. Nothing here books anything. It returns suggestions a pair can accept,
 *      swap or ignore.
 */

export const DATE_SPOT_CATEGORIES = [
  "cafe",
  "restaurant",
  "bakery",
  "park",
  "museum",
  "gallery",
] as const;

export type DateSpotCategory = (typeof DATE_SPOT_CATEGORIES)[number];

/**
 * Google place types we ask for, mapped to our own category enum.
 *
 * Nothing that serves drinking as its primary purpose appears here, and
 * nothing may be added without changing the database enum too (0011).
 */
const TYPE_MAP: Record<string, DateSpotCategory> = {
  cafe: "cafe",
  coffee_shop: "cafe",
  restaurant: "restaurant",
  bakery: "bakery",
  park: "park",
  museum: "museum",
  art_gallery: "gallery",
};

const REQUESTED_TYPES = Object.keys(TYPE_MAP);

export type PlaceSuggestion = {
  place_id: string;
  name: string;
  address: string;
  category: DateSpotCategory;
  lat: number | null;
  lng: number | null;
};

/** False when the key is unset, so the UI can say so instead of failing. */
export function placesConfigured(): boolean {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY);
}

type SearchArgs = {
  /** A city name. See the note in date-spot actions about why not a midpoint. */
  near: string;
  limit?: number;
};

/**
 * Nearby public venues for a city.
 *
 * Returns [] rather than throwing on any failure — a date-spot suggestion is
 * a nicety, and a maps outage must never take down a Gist page or block a
 * couple from arranging their own date.
 */
export async function findPublicVenues({
  near,
  limit = 6,
}: SearchArgs): Promise<PlaceSuggestion[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key || !near.trim()) return [];

  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.primaryType,places.types,places.location",
      },
      body: JSON.stringify({
        textQuery: `cafes and restaurants in ${near}`,
        includedType: "restaurant",
        maxResultCount: Math.min(limit * 2, 20),
      }),
      // A suggestion is not worth a slow page.
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });

    if (!res.ok) return [];
    const data = (await res.json()) as {
      places?: {
        id?: string;
        displayName?: { text?: string };
        formattedAddress?: string;
        primaryType?: string;
        types?: string[];
        location?: { latitude?: number; longitude?: number };
      }[];
    };

    const out: PlaceSuggestion[] = [];
    for (const p of data.places ?? []) {
      const types = [p.primaryType, ...(p.types ?? [])].filter(Boolean) as string[];
      // Allowlist, not denylist: an unrecognised type is dropped, so a new
      // Google type for a drinking venue cannot arrive by default.
      const match = types.find((t) => t in TYPE_MAP);
      if (!match || !p.id || !p.displayName?.text) continue;
      out.push({
        place_id: p.id,
        name: p.displayName.text,
        address: p.formattedAddress ?? "",
        category: TYPE_MAP[match],
        lat: p.location?.latitude ?? null,
        lng: p.location?.longitude ?? null,
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}
