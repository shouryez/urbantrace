// Server only: one issue as a full civic case — reports and their evidence, verifications and their
// checks, trail, intelligence (priority, evidence, assignment, recurrence, incident) and the case file.
import { z } from "zod";
import {
  caseFileSchema,
  complaintLetterSchema,
  followUpAnswerSchema,
  scenarioSchema,
  type CaseFile,
  type CaseReading,
  type Category,
  type ComplaintLetter,
  type FollowUpAnswer,
  type FixVerdict,
  type Scenario,
  type Status,
} from "@/lib/ai/schemas";
import type { Assignment } from "@/lib/intel/assignment";
import type { EvidenceResult } from "@/lib/intel/evidence";
import type { PriorityResult } from "@/lib/intel/priority";
import type { Check } from "@/lib/intel/verification";
import { responsibleBody, type Agency } from "@/lib/routing";
import { photoPublicUrl, supabaseAdmin } from "@/lib/supabase/server";
import { getWard, type WardProfile } from "@/lib/wards";

export type IssueEvent = {
  id: number;
  kind:
    | "reported"
    | "merged"
    | "routed"
    | "triaged"
    | "assigned"
    | "field_team"
    | "site_visit"
    | "repair"
    | "fix_claimed"
    | "verified"
    | "partially_resolved"
    | "verification_failed"
    | "citizen_verified"
    | "citizen_disputed"
    | "recurrence_detected"
    | "incident_linked";
  detail: Record<string, unknown> | null;
  createdAt: string;
};

export type CaseReport = {
  id: number;
  photoUrl: string | null;
  frames: { url: string; time: number | null }[];
  media: "photo" | "video" | "voice";
  createdAt: string;
  extraction: CaseReading | null;
  transcript: string | null;
  language: string | null;
  summaryLocal: string | null;
  /** The reporter's answers to the follow-up questions. */
  followUp: FollowUpAnswer[];
};

export type IssueDetail = {
  id: number;
  category: Category;
  severity: number;
  summary: string;
  status: Status;
  lat: number;
  lng: number;
  address: string | null;
  agency: Agency | null;
  corporationId: string | null;
  bodyName: string | null;
  /** Where the complaint email goes: the ward's zone officer when the ward is known, else the corporation. */
  bodyEmail: string | null;
  bodyCc: string[];
  /** Who bodyEmail reaches, e.g. "Joint Commissioner, Bommanahalli zone". */
  bodyContact: string | null;
  /** The ward the issue is in, with who answers for it; null until the wards are loaded. */
  ward: WardProfile | null;
  backerCount: number;
  letter: ComplaintLetter | null;
  caseFile: CaseFile | null;
  depthClass: string | null;
  createdAt: string;
  verifiedAt: string | null;
  photoUrl: string | null;
  photoPath: string | null;
  /** Author and licence of a seeded stand-in photo (scripts/seed-demo.ts); null for real reports. */
  photoCredit: string | null;
  accessibility: "none" | "partial" | "major";
  priority: (Pick<PriorityResult, "band" | "reason" | "factors"> & { score: number }) | null;
  stage: string;
  assignment: Assignment | null;
  evidence: EvidenceResult | null;
  scenario: Scenario | null;
  roadClass: string | null;
  segmentKey: string | null;
  recurrenceOf: number | null;
  repairLastedDays: number | null;
  incidentId: number | null;
  reports: CaseReport[];
  verifications: {
    id: number;
    afterPhotoUrl: string;
    distanceM: number;
    verdict: FixVerdict | null;
    passed: boolean;
    createdAt: string;
    photoCredit: string | null;
    checks: Check[] | null;
    score: number | null;
    outcome: "verified" | "partial" | "failed" | null;
  }[];
  confirmations: { fixed: number; notFixed: number };
  events: IssueEvent[];
};

type DetailRow = {
  id: number;
  ward_id: number | null;
  category: Category;
  severity: number;
  summary: string;
  status: Status;
  lat: number;
  lng: number;
  address: string | null;
  agency: Agency | null;
  corporation_id: string | null;
  backer_count: number;
  complaint_letter: string | null;
  depth_class: string | null;
  created_at: string;
  verified_at: string | null;
  accessibility: "none" | "partial" | "major";
  priority: number | null;
  priority_factors: Omit<NonNullable<IssueDetail["priority"]>, "score"> | null;
  stage: string;
  assignment: Assignment | null;
  case_file: unknown;
  scenario: unknown;
  evidence: EvidenceResult | null;
  road_class: string | null;
  segment_key: string | null;
  recurrence_of: number | null;
  repair_lasted_days: number | null;
  incident_id: number | null;
};

/** complaint_letter holds the Job 2 JSON as text; anything else reads as no letter. */
export function parseLetter(text: string | null): ComplaintLetter | null {
  if (!text) return null;
  try {
    const parsed = complaintLetterSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Seeded demo rows carry a `credit` for the stand-in photo they use. */
function creditOf(json: unknown): string | null {
  const credit = (json as { credit?: unknown } | null | undefined)?.credit;
  return typeof credit === "string" ? credit : null;
}

type ReportRow = {
  id: number;
  photo_path: string | null;
  ai_result: unknown;
  created_at: string;
  media: { kind?: string; frames?: string[]; frame_times?: number[] } | null;
  extraction: CaseReading | null;
  transcript: string | null;
  language: string | null;
  summary_local: string | null;
};

type VerificationRow = {
  id: number;
  after_photo_path: string;
  distance_m: number;
  ai_verdict: FixVerdict | { error: string };
  passed: boolean;
  created_at: string;
  checks: Check[] | null;
  score: number | null;
  outcome: "verified" | "partial" | "failed" | null;
};

export async function getIssue(id: number): Promise<IssueDetail | null> {
  const db = supabaseAdmin();
  const { data, error } = await db.rpc("issue_detail", { p_id: id });
  if (error) throw new Error(`issue_detail failed: ${error.message}`);
  const row = (data as DetailRow[] | null)?.[0];
  if (!row) return null;

  const [reports, verifications, events, corporation, confirmations] = await Promise.all([
    db.from("reports").select("id, photo_path, ai_result, created_at, media, extraction, transcript, language, summary_local").eq("issue_id", id).order("created_at"),
    db.from("verifications").select("id, after_photo_path, distance_m, ai_verdict, passed, created_at, checks, score, outcome").eq("issue_id", id).order("created_at"),
    db.from("issue_events").select("id, kind, detail, created_at").eq("issue_id", id).order("id"),
    row.agency === "corporation" && row.corporation_id
      ? db.from("corporations").select("email").eq("id", row.corporation_id).maybeSingle<{ email: string | null }>()
      : Promise.resolve({ data: null }),
    db.from("citizen_confirmations").select("fixed").eq("issue_id", id),
  ]);
  const ward = row.ward_id !== null ? await getWard(row.ward_id).catch(() => null) : null;
  const wardContact = row.agency === "corporation" && ward?.contact.to ? ward.contact : null;

  const reportRows = (reports.data ?? []) as ReportRow[];
  const first = reportRows.find((r) => r.photo_path);
  const caseFile = caseFileSchema.safeParse(row.case_file);
  const scenario = scenarioSchema.safeParse(row.scenario);
  const conf = (confirmations.data ?? []) as { fixed: boolean }[];
  return {
    id: row.id,
    category: row.category,
    severity: row.severity,
    summary: row.summary,
    status: row.status,
    lat: row.lat,
    lng: row.lng,
    address: row.address,
    agency: row.agency,
    corporationId: row.corporation_id,
    bodyName: row.agency ? responsibleBody(row.agency, row.corporation_id) : null,
    bodyEmail: wardContact?.to ?? corporation.data?.email ?? null,
    bodyCc: wardContact?.cc ?? [],
    bodyContact: wardContact?.toName ?? (corporation.data?.email ? "Commissioner" : null),
    ward,
    backerCount: row.backer_count,
    letter: parseLetter(row.complaint_letter),
    caseFile: caseFile.success ? caseFile.data : null,
    depthClass: row.depth_class,
    createdAt: row.created_at,
    verifiedAt: row.verified_at,
    photoUrl: first?.photo_path ? photoPublicUrl(first.photo_path) : null,
    photoPath: first?.photo_path ?? null,
    photoCredit: creditOf(first?.ai_result),
    accessibility: row.accessibility ?? "none",
    priority: row.priority !== null && row.priority_factors ? { score: row.priority, ...row.priority_factors } : null,
    stage: row.stage ?? "reported",
    assignment: row.assignment,
    evidence: row.evidence,
    scenario: scenario.success ? scenario.data : null,
    roadClass: row.road_class,
    segmentKey: row.segment_key,
    recurrenceOf: row.recurrence_of,
    repairLastedDays: row.repair_lasted_days,
    incidentId: row.incident_id,
    reports: reportRows.map((r) => ({
      id: r.id,
      photoUrl: r.photo_path ? photoPublicUrl(r.photo_path) : null,
      frames: (r.media?.frames ?? []).map((p, i) => ({ url: photoPublicUrl(p), time: r.media?.frame_times?.[i] ?? null })),
      media: r.media?.kind === "video" ? "video" : r.photo_path ? "photo" : "voice",
      createdAt: r.created_at,
      extraction: r.extraction,
      transcript: r.transcript,
      language: r.language,
      summaryLocal: r.summary_local,
      followUp: z.array(followUpAnswerSchema).catch([]).parse((r.extraction as { follow_up?: unknown } | null)?.follow_up ?? []),
    })),
    verifications: ((verifications.data ?? []) as VerificationRow[]).map((v) => ({
      id: v.id,
      afterPhotoUrl: photoPublicUrl(v.after_photo_path),
      distanceM: v.distance_m,
      verdict: "reason" in v.ai_verdict ? v.ai_verdict : null,
      passed: v.passed,
      createdAt: v.created_at,
      photoCredit: creditOf(v.ai_verdict),
      checks: v.checks,
      score: v.score,
      outcome: v.outcome,
    })),
    confirmations: { fixed: conf.filter((c) => c.fixed).length, notFixed: conf.filter((c) => !c.fixed).length },
    events: ((events.data ?? []) as { id: number; kind: IssueEvent["kind"]; detail: IssueEvent["detail"]; created_at: string }[]).map(
      (e) => ({ id: e.id, kind: e.kind, detail: e.detail, createdAt: e.created_at }),
    ),
  };
}

export async function logEvent(issueId: number, kind: IssueEvent["kind"], detail?: Record<string, unknown>) {
  const { error } = await supabaseAdmin().from("issue_events").insert({ issue_id: issueId, kind, detail: detail ?? null });
  if (error) console.error(`Logging ${kind} event failed:`, error);
}
