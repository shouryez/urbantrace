// Server only: one issue with its reports, verifications and trail (F8), and the complaint letter.
import { complaintLetterSchema, type Category, type ComplaintLetter, type FixVerdict, type Status } from "@/lib/ai/schemas";
import { responsibleBody, type Agency } from "@/lib/routing";
import { photoPublicUrl, supabaseAdmin } from "@/lib/supabase/server";

export type IssueEvent = {
  id: number;
  kind: "reported" | "merged" | "routed" | "fix_claimed" | "verified" | "verification_failed";
  detail: Record<string, unknown> | null;
  createdAt: string;
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
  /** Contact email of the corporation, once confirmed and stored; null otherwise. */
  bodyEmail: string | null;
  backerCount: number;
  letter: ComplaintLetter | null;
  depthClass: string | null;
  createdAt: string;
  verifiedAt: string | null;
  photoUrl: string | null;
  photoPath: string | null;
  /** Author and licence of a seeded stand-in photo (scripts/seed-demo.ts); null for real reports. */
  photoCredit: string | null;
  reports: { id: number; photoUrl: string; createdAt: string }[];
  verifications: {
    id: number;
    afterPhotoUrl: string;
    distanceM: number;
    verdict: FixVerdict | null;
    passed: boolean;
    createdAt: string;
    photoCredit: string | null;
  }[];
  events: IssueEvent[];
};

type DetailRow = {
  id: number;
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

export async function getIssue(id: number): Promise<IssueDetail | null> {
  const db = supabaseAdmin();
  const { data, error } = await db.rpc("issue_detail", { p_id: id });
  if (error) throw new Error(`issue_detail failed: ${error.message}`);
  const row = (data as DetailRow[] | null)?.[0];
  if (!row) return null;

  const [reports, verifications, events, corporation] = await Promise.all([
    db.from("reports").select("id, photo_path, ai_result, created_at").eq("issue_id", id).order("created_at"),
    db
      .from("verifications")
      .select("id, after_photo_path, distance_m, ai_verdict, passed, created_at")
      .eq("issue_id", id)
      .order("created_at"),
    db.from("issue_events").select("id, kind, detail, created_at").eq("issue_id", id).order("id"),
    row.agency === "corporation" && row.corporation_id
      ? db.from("corporations").select("email").eq("id", row.corporation_id).maybeSingle<{ email: string | null }>()
      : Promise.resolve({ data: null }),
  ]);

  const reportRows = (reports.data ?? []) as { id: number; photo_path: string; ai_result: unknown; created_at: string }[];
  const first = reportRows[0];
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
    bodyEmail: corporation.data?.email ?? null,
    backerCount: row.backer_count,
    letter: parseLetter(row.complaint_letter),
    depthClass: row.depth_class,
    createdAt: row.created_at,
    verifiedAt: row.verified_at,
    photoUrl: first ? photoPublicUrl(first.photo_path) : null,
    photoPath: first?.photo_path ?? null,
    photoCredit: creditOf(first?.ai_result),
    reports: reportRows.map((r) => ({ id: r.id, photoUrl: photoPublicUrl(r.photo_path), createdAt: r.created_at })),
    verifications: (
      (verifications.data ?? []) as {
        id: number;
        after_photo_path: string;
        distance_m: number;
        ai_verdict: FixVerdict | { error: string };
        passed: boolean;
        created_at: string;
      }[]
    ).map((v) => ({
      id: v.id,
      afterPhotoUrl: photoPublicUrl(v.after_photo_path),
      distanceM: v.distance_m,
      verdict: "reason" in v.ai_verdict ? v.ai_verdict : null,
      passed: v.passed,
      createdAt: v.created_at,
      photoCredit: creditOf(v.ai_verdict),
    })),
    events: ((events.data ?? []) as { id: number; kind: IssueEvent["kind"]; detail: IssueEvent["detail"]; created_at: string }[]).map(
      (e) => ({ id: e.id, kind: e.kind, detail: e.detail, createdAt: e.created_at }),
    ),
  };
}

export async function logEvent(issueId: number, kind: IssueEvent["kind"], detail?: Record<string, unknown>) {
  const { error } = await supabaseAdmin().from("issue_events").insert({ issue_id: issueId, kind, detail: detail ?? null });
  if (error) console.error(`Logging ${kind} event failed:`, error);
}
