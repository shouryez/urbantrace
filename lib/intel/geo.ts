// Small geometry helpers for the intelligence layer: distances, centroids and geohash cells.

export type Point = { lat: number; lng: number };

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great circle distance in metres. */
export function haversineM(a: Point, b: Point): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Weighted centroid (fine at city scale). */
export function centroid(points: (Point & { weight?: number })[]): Point {
  let lat = 0, lng = 0, w = 0;
  for (const p of points) {
    const pw = p.weight ?? 1;
    lat += p.lat * pw;
    lng += p.lng * pw;
    w += pw;
  }
  return w ? { lat: lat / w, lng: lng / w } : { lat: 0, lng: 0 };
}

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

/** Geohash of a point. Precision 6 is about 1.2 x 0.6 km, 7 about 150 m. */
export function geohash(p: Point, precision = 7): string {
  let latMin = -90, latMax = 90, lngMin = -180, lngMax = 180;
  let hash = "", bit = 0, ch = 0, even = true;
  while (hash.length < precision) {
    if (even) {
      const mid = (lngMin + lngMax) / 2;
      if (p.lng >= mid) { ch |= 1 << (4 - bit); lngMin = mid; } else lngMax = mid;
    } else {
      const mid = (latMin + latMax) / 2;
      if (p.lat >= mid) { ch |= 1 << (4 - bit); latMin = mid; } else latMax = mid;
    }
    even = !even;
    if (bit < 4) bit++;
    else {
      hash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}

/** Centre and size of a geohash cell. */
export function geohashBounds(hash: string): { center: Point; latSpan: number; lngSpan: number } {
  let latMin = -90, latMax = 90, lngMin = -180, lngMax = 180, even = true;
  for (const c of hash) {
    const v = BASE32.indexOf(c);
    for (let b = 4; b >= 0; b--) {
      const on = (v >> b) & 1;
      if (even) {
        const mid = (lngMin + lngMax) / 2;
        if (on) lngMin = mid; else lngMax = mid;
      } else {
        const mid = (latMin + latMax) / 2;
        if (on) latMin = mid; else latMax = mid;
      }
      even = !even;
    }
  }
  return { center: { lat: (latMin + latMax) / 2, lng: (lngMin + lngMax) / 2 }, latSpan: latMax - latMin, lngSpan: lngMax - lngMin };
}

/** A stable key for a road segment: road name plus a ~150 m cell. */
export function segmentKey(road: string | null | undefined, p: Point): string {
  const slug = (road ?? "unnamed road").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "unnamed-road";
  return `${slug}:${geohash(p, 7)}`;
}
