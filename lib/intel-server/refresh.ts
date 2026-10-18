// Server only: recompute the whole city's intelligence (issues, incidents, alerts).
import { CITY_BBOX, fetchIssues } from "@/lib/issues-query";
import { refreshAlerts, refreshIncidentsAround } from "./incidents";
import { refreshIssueIntel } from "./issue";

export async function refreshCity(): Promise<{ issues: number; windows: number; incidents: number; alerts: number }> {
  const issues = await fetchIssues(CITY_BBOX, {}, 2000);
  for (const f of issues) await refreshIssueIntel(f.properties.id);
  // Overlapping 6 km windows around every issue, each visited once.
  const seen = new Set<string>();
  const incidents = new Set<number>();
  for (const f of issues) {
    const [lng, lat] = f.geometry.coordinates;
    const key = `${Math.round(lat * 20)}:${Math.round(lng * 20)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    for (const id of await refreshIncidentsAround(lat, lng, 3)) incidents.add(id);
  }
  const alerts = await refreshAlerts();
  return { issues: issues.length, windows: seen.size, incidents: incidents.size, alerts: alerts.length };
}
