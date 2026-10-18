// POST /api/reports/submit (F2, F4, F5, F6, F9, F12, F13, F14): files the corrected report through submit_report,
// which merges it into an unverified issue of the same category within 30 m (or the confirmed
// target) or creates a new one. A new issue is routed, and its letter is drafted after the reply.
import { after } from "next/server";
import { embed, issueEmbeddingText } from "@/lib/ai/ollama";
import { reverseGeocode } from "@/lib/geocode";
import { logEvent } from "@/lib/issue-detail";
import { mlEnabled } from "@/lib/ml";
import { generateLetter, requestOrigin } from "@/lib/letter";
import { MERGE_RADIUS_M, submitBodySchema, type SubmitResult } from "@/lib/reports";
import { agencyFor, isCorporationId, responsibleBody, type Agency } from "@/lib/routing";
import { supabaseAdmin } from "@/lib/supabase/server";

type SubmitReportRow = { out_issue_id: number; out_merged: boolean };

function fail(error: string, status: number) {
  return Response.json({ error }, { status });
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return fail("Expected a JSON body", 400);
  }
  const parsed = submitBodySchema.safeParse(json);
  if (!parsed.success) return fail("Invalid report", 400);
  const body = parsed.data;
  const db = supabaseAdmin();

  // A confirmed match must really be an unverified issue within 30 m of this report.
  if (body.targetIssueId !== null) {
    const [{ data: distance }, { data: target }] = await Promise.all([
      db.rpc("distance_to_issue", { p_id: body.targetIssueId, p_lng: body.lng, p_lat: body.lat }),
      db.from("issues").select("status").eq("id", body.targetIssueId).maybeSingle<{ status: string }>(),
    ]);
    if (!target) return fail("That issue does not exist", 404);
    if (target.status === "verified") return fail("That issue is already verified as fixed", 409);
    if (typeof distance !== "number" || distance > MERGE_RADIUS_M) {
      return fail(`You need to be within ${MERGE_RADIUS_M} m of the issue to back it`, 422);
    }
  }

  const { data, error } = await db
    .rpc("submit_report", {
      p_category: body.category,
      p_severity: body.severity,
      p_summary: body.summary,
      p_lng: body.lng,
      p_lat: body.lat,
      p_photo_path: body.photoPath,
      p_ai: body.ai ?? { manual: true },
      p_device: body.deviceId,
      p_force_new: body.forceNew,
      p_target_issue_id: body.targetIssueId,
    })
    .single<SubmitReportRow>();
  if (error || !data) {
    console.error("submit_report failed:", error);
    return fail("Could not file the report, try again", 502);
  }
  const issueId = data.out_issue_id;

  if (body.userEdited || body.transcript || body.datasetConsent) {
    // F14: consent counts only when the photo was blurred, which the service being on guarantees.
    const consent = body.datasetConsent && mlEnabled();
    await db
      .from("reports")
      .update({ user_edited: body.userEdited, transcript: body.transcript, ...(consent ? { dataset_consent: true } : {}) })
      .match({ issue_id: issueId, device_id: body.deviceId, photo_path: body.photoPath });
  }

  // F13: a pothole's estimated depth; a merge only fills it in when the issue has none yet.
  if (body.category === "pothole" && body.depthClass) {
    let update = db.from("issues").update({ depth_class: body.depthClass }).eq("id", issueId);
    if (data.out_merged) update = update.is("depth_class", null);
    const { error: depthError } = await update;
    if (depthError) console.error(`Saving depth for issue ${issueId} failed:`, depthError);
  }

  let bodyName: string | null;
  if (!data.out_merged) {
    bodyName = await routeNewIssue(issueId, body);
    const origin = requestOrigin(request);
    // F6: draft the letter, and F12: embed the summary, without holding up the success screen.
    after(async () => {
      try {
        await generateLetter(issueId, origin);
      } catch (err) {
        console.error(`Letter for issue ${issueId} failed:`, err);
      }
    });
    after(async () => {
      try {
        const vector = await embed(issueEmbeddingText(body.category, body.summary));
        const { error: embedError } = await db.from("issues").update({ embedding: JSON.stringify(vector) }).eq("id", issueId);
        if (embedError) throw embedError;
      } catch (err) {
        console.error(`Embedding for issue ${issueId} failed:`, err);
      }
    });
  } else {
    const { data: issue } = await db
      .from("issues")
      .select("agency, corporation_id")
      .eq("id", issueId)
      .single<{ agency: Agency | null; corporation_id: string | null }>();
    bodyName = issue?.agency ? responsibleBody(issue.agency, issue.corporation_id) : null;
  }

  const { data: issue } = await db.from("issues").select("backer_count").eq("id", issueId).single<{ backer_count: number }>();
  const result: SubmitResult = { issueId, merged: data.out_merged, backerCount: issue?.backer_count ?? 1, bodyName };
  return Response.json(result);
}

/**
 * F5: agency by category; for corporation issues, the corporation and ward from the boundaries,
 * falling back to the user's pick. Saves them with the address and logs a routed event.
 */
async function routeNewIssue(
  issueId: number,
  body: { category: Parameters<typeof agencyFor>[0]; lat: number; lng: number; corporationId: string | null },
): Promise<string> {
  const db = supabaseAdmin();
  const agency = agencyFor(body.category);
  let corporationId: string | null = null;
  let wardId: number | null = null;
  if (agency === "corporation") {
    const { data } = await db.rpc("locate_point", { p_lng: body.lng, p_lat: body.lat });
    const located = (data as { corporation_id: string | null; ward_id: number | null }[] | null)?.[0];
    corporationId = located?.corporation_id ?? (isCorporationId(body.corporationId) ? body.corporationId : null);
    wardId = located?.ward_id ?? null;
  }
  const bodyName = responsibleBody(agency, corporationId);
  const address = await reverseGeocode(body.lat, body.lng); // cached by analyze

  const { error } = await db
    .from("issues")
    .update({ agency, corporation_id: corporationId, ward_id: wardId, ...(address ? { address } : {}) })
    .eq("id", issueId);
  if (error) console.error(`Routing issue ${issueId} failed:`, error);
  await logEvent(issueId, "routed", { agency, corporation_id: corporationId, body: bodyName });
  return bodyName;
}
