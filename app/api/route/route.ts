// GET /api/route?from=lat,lng&to=lat,lng (feature 10): walking routes with fewer accessibility obstacles.
// Routes come from the open FOSSGIS OSRM foot router (OpenStreetMap data); obstacles are unresolved
// issues that block or endanger people on foot.
import type { Category } from "@/lib/ai/schemas";
import { CATEGORY_LABELS } from "@/lib/ai/schemas";
import { rankRoutes, type Obstacle } from "@/lib/intel/route";
import { fetchIssues } from "@/lib/issues-query";
import { latLngSchema } from "@/lib/reports";

const ON_FOOT = new Set<Category>(["footpath", "drainage", "waterlogging", "power_hazard", "pothole", "garbage"]);

function parse(v: string | null) {
  const [lat, lng] = (v ?? "").split(",").map(Number);
  return latLngSchema.safeParse({ lat, lng });
}

type OsrmRoute = { distance: number; duration: number; geometry: { coordinates: [number, number][] } };

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const from = parse(p.get("from"));
  const to = parse(p.get("to"));
  if (!from.success || !to.success) return Response.json({ error: "Send from and to as lat,lng" }, { status: 400 });
  const a = from.data, b = to.data;
  if (Math.abs(a.lat - b.lat) > 0.15 || Math.abs(a.lng - b.lng) > 0.15) return Response.json({ error: "Keep walking routes under about 15 km" }, { status: 400 });

  let routes: OsrmRoute[] = [];
  try {
    const url = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${a.lng},${a.lat};${b.lng},${b.lat}?alternatives=3&overview=full&geometries=geojson&steps=false`;
    const res = await fetch(url, { headers: { "User-Agent": process.env.NOMINATIM_USER_AGENT ?? "UrbanTrace/0.1" }, signal: AbortSignal.timeout(10_000) });
    if (res.ok) routes = ((await res.json()) as { routes?: OsrmRoute[] }).routes ?? [];
  } catch (err) {
    console.error("Walking route lookup failed:", err);
  }
  if (!routes.length) return Response.json({ error: "No walking route found right now" }, { status: 502 });

  const pad = 0.01;
  const issues = await fetchIssues([Math.min(a.lng, b.lng) - pad, Math.min(a.lat, b.lat) - pad, Math.max(a.lng, b.lng) + pad, Math.max(a.lat, b.lat) + pad], {}, 1000);
  const obstacles: Obstacle[] = issues
    .filter((f) => f.properties.status !== "verified" && (f.properties.accessibility !== "none" || (ON_FOOT.has(f.properties.category) && f.properties.severity >= 3)))
    .map((f) => ({
      id: f.properties.id,
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
      accessibility: f.properties.accessibility,
      weight: f.properties.accessibility === "major" ? 3 : f.properties.accessibility === "partial" ? 1.5 : 1,
      label: CATEGORY_LABELS[f.properties.category],
    }));

  const ranked = rankRoutes(
    routes.map((r) => ({ coordinates: r.geometry.coordinates, distanceM: Math.round(r.distance), durationS: Math.round(r.duration) })),
    obstacles,
  );
  return Response.json({ routes: ranked, attribution: "Routes: FOSSGIS OSRM, © OpenStreetMap contributors" });
}
