// Server only: the time machine for a point (features 6, 7, 19), the civic health of a map zone
// (feature 13) and a person's civic impact (feature 20).
import { askVision } from "@/lib/ai/ollama";
import { wardAt } from "@/lib/wards";
import { EXPLAIN_SYSTEM, explainUser } from "@/lib/ai/prompts";
import { CATEGORY_LABELS, explanationJsonSchema, explanationSchema, type Category } from "@/lib/ai/schemas";
import { geohash, geohashBounds, haversineM } from "@/lib/intel/geo";
import { rainImpact, type RainImpact } from "@/lib/intel/rain";
import { buildTimeline, type TimelineResult } from "@/lib/intel/timeline";
import type { IssueFeature } from "@/lib/issues";
import { fetchIssues } from "@/lib/issues-query";
import { supabaseAdmin } from "@/lib/supabase/server";
import { rainByDay } from "@/lib/weather";

const lat = (f: IssueFeature) => f.geometry.coordinates[1];
const lng = (f: IssueFeature) => f.geometry.coordinates[0];

export type PlaceHistory = TimelineResult & {
  center: { lat: number; lng: number };
  radiusM: number;
  segment: { key: string | null; road: string | null; repairsByYear: Record<string, number>; lastRepairDaysAgo: number | null };
  rain: RainImpact;
  issues: { id: number; category: Category; status: string; createdAt: string; verifiedAt: string | null; summary: string }[];
};

/** Everything that has happened within `radiusM` of a point, month by month. */
export async function placeHistory(p: { lat: number; lng: number }, radiusM = 60, segmentKey: string | null = null): Promise<PlaceHistory> {
  const d = (radiusM * 3) / 111_000;
  const [all, rain] = await Promise.all([
    fetchIssues([p.lng - d, p.lat - d, p.lng + d, p.lat + d], {}, 500),
    rainByDay(365).catch(() => new Map<string, number>()),
  ]);
  const near = all.filter((f) => haversineM(p, { lat: lat(f), lng: lng(f) }) <= radiusM || (segmentKey && f.properties.segmentKey === segmentKey));
  const timeline = buildTimeline(
    near.map((f) => ({
      id: f.properties.id,
      category: f.properties.category,
      severity: f.properties.severity,
      status: f.properties.status,
      createdAt: f.properties.createdAt,
      verifiedAt: f.properties.verifiedAt,
      recurrenceOf: f.properties.recurrenceOf,
    })),
    { rainByDay: rain },
  );
  const lastRepair = near.map((f) => f.properties.verifiedAt).filter((v): v is string => !!v).sort().at(-1);
  return {
    ...timeline,
    center: p,
    radiusM,
    segment: {
      key: segmentKey,
      road: segmentKey ? segmentKey.split(":")[0]!.replace(/-/g, " ") : null,
      repairsByYear: timeline.repairsByYear,
      lastRepairDaysAgo: lastRepair ? Math.round((Date.now() - new Date(lastRepair).getTime()) / 86_400_000) : null,
    },
    rain: rainImpact(near.map((f) => f.properties.createdAt), rain, { label: "reports" }),
    issues: near.map((f) => ({
      id: f.properties.id,
      category: f.properties.category,
      status: f.properties.status,
      createdAt: f.properties.createdAt,
      verifiedAt: f.properties.verifiedAt,
      summary: f.properties.summary,
    })),
  };
}

export type ZoneReport = {
  cell: string;
  center: { lat: number; lng: number };
  reports: number;
  issues: number;
  recurring: number;
  unresolved: number;
  accessibility: number;
  incidents: number;
  mainIssue: string | null;
  health: number; // 0..100, 100 = well maintained
  summary: string;
  rain: RainImpact;
  /** The ward at the centre of the cell, once the wards are loaded. */
  ward: { id: number; name: string } | null;
};

/** Civic health of one ~1 km geohash cell, with a cached plain-words summary. */
export async function zoneReport(cell: string): Promise<ZoneReport> {
  const b = geohashBounds(cell);
  const [issues, rain] = await Promise.all([
    fetchIssues([b.center.lng - b.lngSpan / 2, b.center.lat - b.latSpan / 2, b.center.lng + b.lngSpan / 2, b.center.lat + b.latSpan / 2], {}, 1000),
    rainByDay(120).catch(() => new Map<string, number>()),
  ]);
  const inCell = issues.filter((f) => geohash({ lat: lat(f), lng: lng(f) }, cell.length) === cell);
  const counts = new Map<Category, number>();
  for (const f of inCell) counts.set(f.properties.category, (counts.get(f.properties.category) ?? 0) + f.properties.backerCount);
  const main = [...counts].sort((a, b2) => b2[1] - a[1])[0]?.[0] ?? null;
  const unresolved = inCell.filter((f) => f.properties.status !== "verified");
  const stats = {
    reports: inCell.reduce((s, f) => s + f.properties.backerCount, 0),
    issues: inCell.length,
    recurring: inCell.filter((f) => f.properties.recurrenceOf !== null).length,
    unresolved: unresolved.length,
    accessibility: inCell.filter((f) => f.properties.accessibility !== "none").length,
    incidents: new Set(inCell.map((f) => f.properties.incidentId).filter((x) => x !== null)).size,
  };
  const load = unresolved.reduce((s, f) => s + (f.properties.priority ?? 30) / 100, 0);
  const health = Math.round(100 * Math.exp(-load / 3));
  const rainNote = rainImpact(inCell.map((f) => f.properties.createdAt), rain, { label: "reports" });

  const db = supabaseAdmin();
  const { data: cached } = await db.from("zone_summaries").select("summary, stats").eq("cell", cell).maybeSingle();
  let summary = cached?.summary as string | undefined;
  if (!summary || JSON.stringify(cached?.stats) !== JSON.stringify(stats)) {
    const facts = [
      `${stats.reports} reports about ${stats.issues} problems in this zone of about 1 km`,
      `${stats.unresolved} unresolved, ${stats.recurring} recurring after a repair, ${stats.accessibility} affecting people on foot`,
      `Main problem by reports: ${main ? CATEGORY_LABELS[main] : "none"}`,
      `All problems: ${[...counts].map(([c, n]) => `${CATEGORY_LABELS[c]} ${n}`).join(", ") || "none"}`,
      `Incidents (groups with one likely cause): ${stats.incidents}`,
      `Rain pattern: ${rainNote.summary}`,
    ];
    summary = stats.issues
      ? await askVision(EXPLAIN_SYSTEM, explainUser("zone", facts), [], explanationJsonSchema, explanationSchema)
          .then((e) => e.explanation)
          .catch(() => `${stats.unresolved} unresolved problems here, mostly ${main ? CATEGORY_LABELS[main].toLowerCase() : "mixed"}.`)
      : "No problems reported in this zone. It looks well maintained.";
    await db.from("zone_summaries").upsert({ cell, summary, stats, updated_at: new Date().toISOString() });
  }
  const wardId = await wardAt(b.center.lat, b.center.lng).catch(() => null);
  const { data: ward } = wardId ? await supabaseAdmin().from("wards").select("id, name").eq("id", wardId).maybeSingle<{ id: number; name: string }>() : { data: null };
  return { cell, center: b.center, ...stats, mainIssue: main ? CATEGORY_LABELS[main] : null, health, summary, rain: rainNote, ward: ward ?? null };
}

export type Impact = {
  reports: number;
  issuesBacked: number;
  verifiedIssues: number;
  accessibilityHazards: number;
  recurringSurfaced: number;
  mergedInto: number;
  incidents: number;
  firstReportAt: string | null;
};

/** What one device's reports have done (no names, no points, no leaderboard). */
export async function impactFor(deviceId: string): Promise<Impact> {
  const db = supabaseAdmin();
  const { data: reports } = await db.from("reports").select("issue_id, created_at").eq("device_id", deviceId);
  const ids = [...new Set((reports ?? []).map((r) => r.issue_id as number))];
  if (!ids.length) return { reports: 0, issuesBacked: 0, verifiedIssues: 0, accessibilityHazards: 0, recurringSurfaced: 0, mergedInto: 0, incidents: 0, firstReportAt: null };
  const { data: issues } = await db.from("issues").select("id, status, accessibility, recurrence_of, incident_id, backer_count").in("id", ids);
  const rows = issues ?? [];
  return {
    reports: reports!.length,
    issuesBacked: ids.length,
    verifiedIssues: rows.filter((r) => r.status === "verified").length,
    accessibilityHazards: rows.filter((r) => r.accessibility !== "none").length,
    recurringSurfaced: rows.filter((r) => r.recurrence_of !== null).length,
    mergedInto: rows.filter((r) => (r.backer_count as number) > 1).length,
    incidents: new Set(rows.map((r) => r.incident_id).filter((x) => x !== null)).size,
    firstReportAt: (reports ?? []).map((r) => r.created_at as string).sort()[0] ?? null,
  };
}
