// Server only: recompute an issue's intelligence — recurrence, crowd evidence, priority,
// assignment, accessibility — from its reports, repair history, incident and recent rain.
import type { Category } from "@/lib/ai/schemas";
import { logEvent } from "@/lib/issue-detail";
import { assign } from "@/lib/intel/assignment";
import { systemicCause, type CausalNode } from "@/lib/intel/causal";
import { assessEvidence, type EvidenceReport } from "@/lib/intel/evidence";
import { computePriority } from "@/lib/intel/priority";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recentRainMm } from "@/lib/weather";

type DetailRow = {
  id: number;
  category: Category;
  severity: number;
  status: string;
  lat: number;
  lng: number;
  backer_count: number;
  depth_class: string | null;
  created_at: string;
  accessibility: "none" | "partial" | "major";
  road_class: string | null;
  recurrence_of: number | null;
  incident_id: number | null;
};

type ReportRow = {
  device_id: string;
  photo_path: string | null;
  ai_result: { severity?: unknown; category?: unknown } | null;
  extraction: { issues?: { category: string; severity: number }[]; accessibility?: string } | null;
  media: { kind?: string; lat?: number; lng?: number } | null;
  severity_opinion: number | null;
  gps_accuracy_m: number | null;
  duration_claim_days: number | null;
  created_at: string;
};

const ACCESS_RANK = { none: 0, partial: 1, major: 2 } as const;

/** Follows recurrence links back to count earlier repairs of the same spot (at most 6). */
async function previousRepairs(fromId: number | null): Promise<number> {
  let count = 0;
  let id = fromId;
  const db = supabaseAdmin();
  while (id !== null && count < 6) {
    count++;
    const { data } = await db.from("issues").select("recurrence_of").eq("id", id).maybeSingle<{ recurrence_of: number | null }>();
    id = data?.recurrence_of ?? null;
  }
  return Math.max(0, count - 1);
}

export async function refreshIssueIntel(issueId: number): Promise<void> {
  const db = supabaseAdmin();
  const { data } = await db.rpc("issue_detail", { p_id: issueId });
  const issue = (data as DetailRow[] | null)?.[0];
  if (!issue) return;

  const [{ data: reportRows }, { count: recentMerges }, rain] = await Promise.all([
    db.from("reports").select("device_id, photo_path, ai_result, extraction, media, severity_opinion, gps_accuracy_m, duration_claim_days, created_at").eq("issue_id", issueId),
    db.from("issue_events").select("id", { count: "exact", head: true }).eq("issue_id", issueId).eq("kind", "merged").gte("created_at", new Date(Date.now() - 72 * 3_600_000).toISOString()),
    recentRainMm(3),
  ]);
  const reports = (reportRows ?? []) as ReportRow[];

  // Recurrence (feature 7): a verified repair of the same kind nearby before this issue appeared.
  let recurrenceOf = issue.recurrence_of;
  let lastedDays: number | null = null;
  let newlyRecurring = false;
  if (recurrenceOf === null && issue.status !== "verified") {
    const { data: near } = await db.rpc("verified_nearby", { p_lng: issue.lng, p_lat: issue.lat, p_category: issue.category, p_radius_m: 40 });
    const prev = ((near ?? []) as { id: number; verified_at: string | null }[]).find((n) => n.id !== issue.id && n.verified_at && n.verified_at < issue.created_at);
    if (prev) {
      recurrenceOf = prev.id;
      lastedDays = Math.round((new Date(issue.created_at).getTime() - new Date(prev.verified_at!).getTime()) / 86_400_000);
      newlyRecurring = true;
    }
  }
  const repairsBefore = recurrenceOf !== null ? await previousRepairs(recurrenceOf) : 0;

  let causeConfidence: number | null = null;
  let causeLabel: string | null = null;
  let rootCause: CausalNode | null = null;
  if (issue.incident_id !== null) {
    const { data: inc } = await db.from("incidents").select("root_cause, confidence, title").eq("id", issue.incident_id).maybeSingle();
    if (inc) {
      causeConfidence = inc.confidence as number;
      causeLabel = inc.title as string;
      rootCause = inc.root_cause as CausalNode;
    }
  }
  if (recurrenceOf !== null && !causeLabel) {
    const s = systemicCause(issue.category, rain);
    causeLabel = s.label;
    rootCause = s.cause;
    causeConfidence = 0.45;
  }

  const evidenceReports: EvidenceReport[] = reports.map((r) => {
    const fromCase = r.extraction?.issues?.find((i) => i.category === issue.category)?.severity;
    const ai = typeof fromCase === "number" ? fromCase : typeof r.ai_result?.severity === "number" ? r.ai_result.severity : null;
    const kind = r.media?.kind === "video" ? "video" : r.photo_path ? "photo" : "voice";
    return {
      lat: r.media?.lat ?? issue.lat,
      lng: r.media?.lng ?? issue.lng,
      deviceId: r.device_id,
      aiSeverity: ai,
      userSeverity: r.severity_opinion,
      media: kind,
      gpsAccuracyM: r.gps_accuracy_m,
      durationClaimDays: r.duration_claim_days,
      createdAt: r.created_at,
    };
  });
  const evidence = assessEvidence(evidenceReports, { recurring: recurrenceOf !== null, previousRepairs: repairsBefore, causeConfidence, causeLabel });

  // Accessibility: the worst any report saw.
  let accessibility = issue.accessibility;
  for (const r of reports) {
    const a = r.extraction?.accessibility;
    if ((a === "partial" || a === "major") && ACCESS_RANK[a] > ACCESS_RANK[accessibility]) accessibility = a;
  }

  const daysOpen = (Date.now() - new Date(issue.created_at).getTime()) / 86_400_000;
  const priority = computePriority({
    category: issue.category,
    severity: issue.severity,
    backerCount: issue.backer_count,
    accessibility,
    roadClass: issue.road_class,
    depthClass: issue.depth_class,
    isRecurring: recurrenceOf !== null,
    previousRepairs: repairsBefore,
    evidenceConfidence: evidence.overall,
    recentMerges: recentMerges ?? 0,
    rainLast3DaysMm: rain,
    daysOpen: issue.status === "verified" ? 0 : daysOpen,
    inIncident: issue.incident_id !== null,
  });
  const assignment = assign({
    category: issue.category,
    severity: issue.severity,
    depthClass: issue.depth_class,
    backerCount: issue.backer_count,
    rootCause,
    isRecurring: recurrenceOf !== null,
    priorityBand: priority.band,
  });

  await db
    .from("issues")
    .update({
      priority: issue.status === "verified" ? 0 : priority.score,
      priority_factors: { band: priority.band, reason: priority.reason, factors: priority.factors, rain_mm: rain },
      evidence,
      assignment,
      accessibility,
      recurrence_of: recurrenceOf,
      ...(lastedDays !== null ? { repair_lasted_days: lastedDays } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", issueId);

  if (newlyRecurring) {
    await logEvent(issueId, "recurrence_detected", {
      previous_issue: recurrenceOf,
      lasted_days: lastedDays,
      previous_repairs: repairsBefore,
      systemic_cause: causeLabel,
    });
  }
}
