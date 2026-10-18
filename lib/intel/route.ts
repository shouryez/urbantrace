// Accessible walking routes (feature 10): rank walking routes by the obstacles along them.
// An obstacle is an unresolved issue that blocks or endangers people on foot, within 20 m of the
// route. Major obstructions cost most; the route with the lowest cost wins, then the shortest.
import type { Point } from "./geo";

export type Obstacle = Point & { id: number; weight: number; label: string; accessibility: "none" | "partial" | "major" };
export type RankedRoute = { coordinates: [number, number][]; distanceM: number; durationS: number; cost: number; obstacles: Obstacle[]; recommended: boolean };

const M_PER_DEG = 111_320;

/** Distance in metres from p to segment ab (equirectangular, fine within a city). */
export function pointToSegmentM(p: Point, a: Point, b: Point): number {
  const k = Math.cos((p.lat * Math.PI) / 180);
  const ax = (a.lng - p.lng) * k * M_PER_DEG, ay = (a.lat - p.lat) * M_PER_DEG;
  const bx = (b.lng - p.lng) * k * M_PER_DEG, by = (b.lat - p.lat) * M_PER_DEG;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
}

export function obstaclesNear(coords: [number, number][], obstacles: Obstacle[], withinM = 20): Obstacle[] {
  return obstacles.filter((o) => {
    for (let i = 1; i < coords.length; i++) {
      const a = { lng: coords[i - 1]![0], lat: coords[i - 1]![1] };
      const b = { lng: coords[i]![0], lat: coords[i]![1] };
      if (pointToSegmentM(o, a, b) <= withinM) return true;
    }
    return false;
  });
}

export function rankRoutes(routes: { coordinates: [number, number][]; distanceM: number; durationS: number }[], obstacles: Obstacle[]): RankedRoute[] {
  const ranked = routes.map((r) => {
    const near = obstaclesNear(r.coordinates, obstacles);
    return { ...r, obstacles: near, cost: near.reduce((s, o) => s + o.weight, 0), recommended: false };
  });
  ranked.sort((a, b) => a.cost - b.cost || a.distanceM - b.distanceM);
  if (ranked[0]) ranked[0].recommended = true;
  return ranked;
}
