// Server only: find incidents (feature 3) and alerts (feature 16) from the database, save them with
// their root cause graph (feature 2), and explain them in plain words with the model.
import { askVision } from "@/lib/ai/ollama";
import { EXPLAIN_SYSTEM, explainUser } from "@/lib/ai/prompts";
import { CATEGORY_LABELS, explanationJsonSchema, explanationSchema, type Category } from "@/lib/ai/schemas";
import { inferRootCause, NODE_LABELS } from "@/lib/intel/causal";
import { detectAlerts, detectIncidents, type DetectedIncident, type ReportEvent } from "@/lib/intel/incidents";
import { fetchIssues, CITY_BBOX } from "@/lib/issues-query";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recentRainMm } from "@/lib/weather";
import { refreshIssueIntel } from "./issue";

const KM_LAT = 1 / 111;

function bboxAround(lat: number, lng: number, km: number): [number, number, number, number] {
  const dLng = km / (111 * Math.cos((lat * Math.PI) / 180));
  return [lng - dLng, lat - km * KM_LAT, lng + dLng, lat + km * KM_LAT];
}

function categoryList(cats: Partial<Record<Category, number>>): string {
  return (Object.entries(cats) as [Category, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => `${CATEGORY_LABELS[c]} (${n})`)
    .join(", ");
}

/** Plain words for an incident; falls back to a template if the model is unavailable. */
async function explain(inc: DetectedIncident, rainMm: number): Promise<{ title: string; explanation: string }> {
  const facts = [
    `${inc.reportCount} reports about ${inc.issueCount} problems within ${Math.round(inc.radiusM)} m`,
    `Problems: ${categoryList(inc.categories)}`,
    `Likely root cause from the causal analysis: ${inc.rootCause.label} (confidence ${Math.round(inc.confidence * 100)}%)`,
    `Other possible causes: ${inc.rootCause.ranked.slice(1, 3).map((r) => NODE_LABELS[r.cause]).join(", ")}`,
    `Causal links: ${inc.rootCause.graph.edges.map((e) => `${NODE_LABELS[e.from]} → ${NODE_LABELS[e.to]} (${e.why})`).join("; ")}`,
    `First report ${inc.firstAt.slice(0, 10)}, latest ${inc.lastAt.slice(0, 10)}`,
    `Rain in the last 3 days: ${rainMm} mm`,
  ];
  try {
    return await askVision(EXPLAIN_SYSTEM, explainUser("incident", facts), [], explanationJsonSchema, explanationSchema);
  } catch {
    return {
      title: inc.title,
      explanation: `${inc.reportCount} reports nearby most likely share one underlying problem: ${inc.rootCause.label.toLowerCase()}. Fixing it should clear several of the reported problems at once.`,
    };
  }
}

/** Re-detects incidents around a point and saves them; returns the ids of saved incidents. */
export async function refreshIncidentsAround(lat: number, lng: number, km = 3): Promise<number[]> {
  const db = supabaseAdmin();
  const [issues, rain] = await Promise.all([fetchIssues(bboxAround(lat, lng, km), {}, 2000), recentRainMm(3)]);
  const found = detectIncidents(
    issues.map((f) => ({
      id: f.properties.id,
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
      category: f.properties.category,
      status: f.properties.status,
      severity: f.properties.severity,
      backerCount: f.properties.backerCount,
      createdAt: f.properties.createdAt,
    })),
    { recentRainMm: rain },
  );

  const ids: number[] = [];
  for (const inc of found) {
    const { data: existing } = await db.from("incidents").select("id, explanation, report_count").eq("signature", inc.signature).maybeSingle();
    // Ask the model again only for new incidents or ones that grew a lot.
    const needsWords = !existing || !existing.explanation || inc.reportCount >= (existing.report_count as number) * 1.5;
    const words = needsWords ? await explain(inc, rain) : null;
    const { data: id, error } = await db.rpc("upsert_incident", {
      p_signature: inc.signature,
      p_kind: "cluster",
      p_title: words?.title ?? inc.title,
      p_root_cause: inc.rootCause.cause,
      p_graph: { ...inc.rootCause.graph, ranked: inc.rootCause.ranked.slice(0, 4), reasons: inc.reasons, coverage: inc.rootCause.coverage },
      p_explanation: words?.explanation ?? null,
      p_confidence: inc.confidence,
      p_lng: inc.center.lng,
      p_lat: inc.center.lat,
      p_radius_m: inc.radiusM,
      p_report_count: inc.reportCount,
      p_issue_count: inc.issueCount,
      p_categories: inc.categories,
      p_first_at: inc.firstAt,
      p_last_at: inc.lastAt,
      p_issue_ids: inc.issueIds,
    });
    if (error) {
      console.error("upsert_incident failed:", error);
      continue;
    }
    ids.push(id as number);
    if (!existing) {
      for (const issueId of inc.issueIds) await db.from("issue_events").insert({ issue_id: issueId, kind: "incident_linked", detail: { incident_id: id, title: words?.title ?? inc.title } });
    }
  }

  // Incidents around here that no longer hold together are resolved and released.
  const signatures = new Set(found.map((f) => f.signature));
  const { data: active } = await db.from("incidents").select("id, signature").eq("kind", "cluster").eq("status", "active");
  const { data: points } = await db.rpc("incident_points");
  const near = new Set(
    ((points ?? []) as { id: number; lat: number; lng: number }[])
      .filter((p) => Math.abs(p.lat - lat) <= km * KM_LAT && Math.abs(p.lng - lng) <= km * KM_LAT * 1.1)
      .map((p) => p.id),
  );
  for (const row of active ?? []) {
    if (near.has(row.id as number) && !signatures.has(row.signature as string)) {
      await db.from("incidents").update({ status: "resolved", updated_at: new Date().toISOString() }).eq("id", row.id);
      await db.from("issues").update({ incident_id: null }).eq("incident_id", row.id);
    }
  }

  // Being part of an incident changes priority.
  const members = found.flatMap((f) => f.issueIds).slice(0, 40);
  for (const id of members) await refreshIssueIntel(id);
  return ids;
}

/** Looks for sudden bursts of reports city wide and saves them as alerts. */
export async function refreshAlerts(): Promise<number[]> {
  const db = supabaseAdmin();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [issues, { data: events }] = await Promise.all([
    fetchIssues(CITY_BBOX, {}, 2000),
    db.from("issue_events").select("issue_id, kind, created_at").in("kind", ["reported", "merged"]).gte("created_at", since).limit(5000),
  ]);
  const where = new Map(issues.map((f) => [f.properties.id, f]));
  const reportEvents: ReportEvent[] = [];
  for (const e of events ?? []) {
    const f = where.get(e.issue_id as number);
    if (f) reportEvents.push({ issueId: f.properties.id, category: f.properties.category, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], at: e.created_at as string });
  }

  const ids: number[] = [];
  for (const alert of detectAlerts(reportEvents)) {
    const root = inferRootCause(alert.categories, { recentRainMm: await recentRainMm(1) });
    const { data: id, error } = await db.rpc("upsert_incident", {
      p_signature: alert.signature,
      p_kind: "alert",
      p_title: alert.title,
      p_root_cause: root.cause,
      p_graph: { ...root.graph, issueIds: alert.issueIds, areaKm2: alert.areaKm2, pValue: alert.pValue, windowMinutes: alert.windowMinutes, locations: alert.locations },
      p_explanation: `${alert.reports} reports from ${alert.locations} places in ${alert.windowMinutes} minutes, far above this area's usual rate. Possible cause: ${root.label.toLowerCase()}.`,
      p_confidence: Math.min(0.99, 1 - alert.pValue),
      p_lng: alert.center.lng,
      p_lat: alert.center.lat,
      p_radius_m: alert.radiusM,
      p_report_count: alert.reports,
      p_issue_count: alert.issueIds.length,
      p_categories: alert.categories,
      p_first_at: alert.firstAt,
      p_last_at: alert.lastAt,
      p_issue_ids: [], // alerts do not take issues away from their incident
    });
    if (error) console.error("Saving alert failed:", error);
    else ids.push(id as number);
  }
  // Alerts expire 24 hours after their last report.
  await db.from("incidents").update({ status: "resolved" }).eq("kind", "alert").eq("status", "active").lt("last_at", new Date(Date.now() - 24 * 3_600_000).toISOString());
  return ids;
}
