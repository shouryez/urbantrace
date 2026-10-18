// Geocoding with OpenStreetMap's Nominatim, from the server only. Its usage policy asks for at
// most one request a second, a real User-Agent and caching, so all three are done here.
// https://operations.osmfoundation.org/policies/nominatim/

const MAX_CACHE = 1000;
const cache = new Map<string, Place>();
let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

/** A point's short address, the road it is on and that road's OSM class (primary, residential, …). */
export type Place = { address: string | null; road: string | null; roadClass: string | null };

/** Runs `fn` after the previous request, at least one second after it started. */
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastRequestAt + 1000 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
    return fn();
  });
  queue = run.catch(() => undefined);
  return run;
}

const headers = () => ({ "User-Agent": process.env.NOMINATIM_USER_AGENT ?? "UrbanTrace/0.1", "Accept-Language": "en" });

type NominatimReverse = {
  display_name?: unknown;
  category?: unknown;
  type?: unknown;
  address?: { road?: unknown; pedestrian?: unknown; footway?: unknown };
};

/** Address, road and road class for a point; null fields when Nominatim has none. */
export async function reversePlace(lat: number, lng: number): Promise<Place> {
  // About 11 m of rounding, so reports of the same spot share one lookup.
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const place = await throttled(async (): Promise<Place | null> => {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.search = new URLSearchParams({ format: "jsonv2", lat: String(lat), lon: String(lng), zoom: "18" }).toString();
    try {
      const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(5_000) });
      if (!res.ok) return null;
      const data = (await res.json()) as NominatimReverse;
      if (typeof data.display_name !== "string") return null;
      const road = [data.address?.road, data.address?.pedestrian, data.address?.footway].find((r): r is string => typeof r === "string") ?? null;
      return {
        // "Road, Area, Locality, Bengaluru, Karnataka, 560001, India" -> the first four parts.
        address: data.display_name.split(",").slice(0, 4).map((s) => s.trim()).join(", "),
        road,
        roadClass: data.category === "highway" && typeof data.type === "string" ? data.type : null,
      };
    } catch {
      return null;
    }
  });

  if (place === null) return { address: null, road: null, roadClass: null }; // do not cache outages
  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, place);
  return place;
}

/** Short street address for a point, or null when none comes back (show coordinates instead). */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  return (await reversePlace(lat, lng)).address;
}

/** Places matching a search, inside Bengaluru, for the accessible route planner. */
export async function searchPlaces(q: string): Promise<{ name: string; lat: number; lng: number }[]> {
  const query = q.trim().slice(0, 120);
  if (query.length < 3) return [];
  return throttled(async () => {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.search = new URLSearchParams({
      format: "jsonv2", q: query, limit: "5", bounded: "1", viewbox: "77.35,13.20,77.85,12.75", countrycodes: "in",
    }).toString();
    try {
      const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(6_000) });
      if (!res.ok) return [];
      const rows = (await res.json()) as { display_name?: string; lat?: string; lon?: string }[];
      return rows
        .filter((r) => r.display_name && r.lat && r.lon)
        .map((r) => ({ name: r.display_name!.split(",").slice(0, 3).join(","), lat: Number(r.lat), lng: Number(r.lon) }));
    } catch {
      return [];
    }
  });
}
