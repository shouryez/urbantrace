// Reverse geocoding with OpenStreetMap's Nominatim, from the server only. Its usage policy asks
// for at most one request a second, a real User-Agent and caching, so all three are done here.
// https://operations.osmfoundation.org/policies/nominatim/

const MAX_CACHE = 1000;
const cache = new Map<string, string>();
let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

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

/** Short street address for a point, or null when none comes back (show coordinates instead). */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  // About 11 m of rounding, so reports of the same spot share one lookup.
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const address = await throttled(async () => {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.search = new URLSearchParams({ format: "jsonv2", lat: String(lat), lon: String(lng), zoom: "18" }).toString();
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": process.env.NOMINATIM_USER_AGENT ?? "UrbanTrace/0.1",
          "Accept-Language": "en",
        },
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { display_name?: unknown };
      if (typeof data.display_name !== "string") return null;
      // "Road, Area, Locality, Bengaluru, Karnataka, 560001, India" -> the first four parts.
      return data.display_name.split(",").slice(0, 4).map((s) => s.trim()).join(", ");
    } catch {
      return null;
    }
  });

  if (address === null) return null; // do not cache outages
  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, address);
  return address;
}
