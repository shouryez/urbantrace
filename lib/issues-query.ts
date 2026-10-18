// Server only: issue reads shared by GET /api/issues and the landing page.
import type { Category, Status } from "@/lib/ai/schemas";
import type { IssueFeature, IssueFilters } from "@/lib/issues";
import { photoPublicUrl, supabaseAdmin } from "@/lib/supabase/server";

type IssueRow = {
  id: number;
  category: Category;
  severity: number;
  summary: string;
  status: Status;
  lat: number;
  lng: number;
  address: string | null;
  corporation_id: string | null;
  backer_count: number;
  created_at: string;
  photo_path: string | null;
  verified_at: string | null;
  accessibility: "none" | "partial" | "major" | null;
  priority: number | null;
  stage: string | null;
  incident_id: number | null;
  recurrence_of: number | null;
  segment_key: string | null;
};

/** Greater Bengaluru, for reads that are not tied to a map view. */
export const CITY_BBOX = [77.3, 12.7, 77.9, 13.3] as const;

/** Issues inside a bbox, newest first, as GeoJSON features. Throws on a database error. */
export async function fetchIssues(
  [minLng, minLat, maxLng, maxLat]: readonly [number, number, number, number],
  { status, category, corporation }: IssueFilters = {},
  limit = 1000,
): Promise<IssueFeature[]> {
  const { data, error } = await supabaseAdmin().rpc("issues_in_bbox", {
    p_min_lng: minLng,
    p_min_lat: minLat,
    p_max_lng: maxLng,
    p_max_lat: maxLat,
    p_status: status ?? null,
    p_category: category ?? null,
    p_corporation: corporation ?? null,
    p_limit: limit,
  });
  if (error || !data) throw new Error(`issues_in_bbox failed: ${error?.message ?? "no data"}`);

  return (data as IssueRow[]).map((r) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [r.lng, r.lat] },
    properties: {
      id: r.id,
      category: r.category,
      severity: r.severity,
      summary: r.summary,
      status: r.status,
      address: r.address,
      corporationId: r.corporation_id,
      backerCount: r.backer_count,
      createdAt: r.created_at,
      photoUrl: r.photo_path ? photoPublicUrl(r.photo_path) : null,
      verifiedAt: r.verified_at ?? null,
      accessibility: r.accessibility ?? "none",
      priority: r.priority ?? null,
      stage: r.stage ?? "reported",
      incidentId: r.incident_id ?? null,
      recurrenceOf: r.recurrence_of ?? null,
      segmentKey: r.segment_key ?? null,
    },
  }));
}

export type CityStats = { issues: number; backers: number; verified: number };

/** Landing counters: issues reported, people backing them, fixes verified. Null if the database is down. */
export async function getCityStats(): Promise<CityStats | null> {
  const { data, error } = await supabaseAdmin().from("issues").select("status, backer_count").limit(100_000);
  if (error || !data) {
    console.error("City stats failed:", error);
    return null;
  }
  return {
    issues: data.length,
    backers: data.reduce((sum, r) => sum + (r.backer_count as number), 0),
    verified: data.filter((r) => r.status === "verified").length,
  };
}

/** Latest verified fix with both photos, for the landing Proof of fix section. */
export async function getLatestFix(): Promise<{ issueId: number; beforeUrl: string; afterUrl: string } | null> {
  const { data, error } = await supabaseAdmin()
    .from("verifications")
    .select("issue_id, after_photo_path")
    .eq("passed", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const { data: report } = await supabaseAdmin()
    .from("reports")
    .select("photo_path")
    .eq("issue_id", data.issue_id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!report) return null;
  return {
    issueId: data.issue_id as number,
    beforeUrl: photoPublicUrl(report.photo_path as string),
    afterUrl: photoPublicUrl(data.after_photo_path as string),
  };
}
