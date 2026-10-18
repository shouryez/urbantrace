// The ward KML of the GBA ward delimitation 2025 (OpenCity): SimpleData fields and polygons per ward.
// A small reader for this one file, used by scripts/seed-wards.ts and scripts/seed-demo.ts.

export type KmlWard = { fields: Record<string, string>; polygons: number[][][][] };

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();

function ring(text: string): number[][] {
  return text
    .trim()
    .split(/\s+/)
    .map((t) => t.split(",").slice(0, 2).map(Number))
    .filter((p) => p.length === 2 && p.every(Number.isFinite));
}

/** A small KML reader for this file: SimpleData fields and Polygon rings per Placemark. */
export function parseKml(kml: string): KmlWard[] {
  const wards: KmlWard[] = [];
  for (const [, body] of kml.matchAll(/<Placemark>([\s\S]*?)<\/Placemark>/g)) {
    const fields: Record<string, string> = {};
    for (const [, name, value] of body!.matchAll(/<SimpleData name="([^"]+)">([\s\S]*?)<\/SimpleData>/g)) fields[name!.trim()] = decode(value!);
    const polygons: number[][][][] = [];
    for (const [, poly] of body!.matchAll(/<Polygon>([\s\S]*?)<\/Polygon>/g)) {
      const outer = /<outerBoundaryIs>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/.exec(poly!)?.[1];
      if (!outer) continue;
      const inner = [...poly!.matchAll(/<innerBoundaryIs>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/g)].map((m) => ring(m[1]!));
      polygons.push([ring(outer), ...inner]);
    }
    if (polygons.length) wards.push({ fields, polygons });
  }
  return wards;
}

/** A point inside the ward: the vertex average of its largest ring, nudged to the nearest vertex if outside. */
export function wardPoint(w: KmlWard): { lat: number; lng: number } {
  const outer = w.polygons.map((p) => p[0]!).sort((a, b) => b.length - a.length)[0]!;
  const lng = outer.reduce((s, p) => s + p[0]!, 0) / outer.length;
  const lat = outer.reduce((s, p) => s + p[1]!, 0) / outer.length;
  if (inside(outer, lng, lat)) return { lat, lng };
  const [x, y] = outer[Math.floor(outer.length / 2)]!;
  return { lat: (y! * 3 + lat) / 4, lng: (x! * 3 + lng) / 4 };
}

function inside(ring: number[][], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!, [xj, yj] = ring[j]!;
    if (yi! > y !== yj! > y && x < ((xj! - xi!) * (y - yi!)) / (yj! - yi!) + xi!) hit = !hit;
  }
  return hit;
}
