// POST /api/issues/[id]/verify (F7, feature 4): proof of fix that is actually verified.
// The after photo is checked for location (GPS, plain code), road segment, scene similarity (edge
// maps), capture time (EXIF, read before the stored copy drops it) and the model's reading of the
// before and after pair, including problems still left. The outcome is verified, partially
// resolved or not verified. The issue is fix_claimed while the check runs; one check at a time.
import { after as afterResponse } from "next/server";
import { askVision, ModelReplyError } from "@/lib/ai/ollama";
import { FIX_VERDICT_SYSTEM, FIX_VERDICT_USER } from "@/lib/ai/prompts";
import { fixVerdictJsonSchema, fixVerdictSchema } from "@/lib/ai/schemas";
import { reversePlace } from "@/lib/geocode";
import { cleanForStorage, photoTakenAt, sceneSimilarity, toModelImage } from "@/lib/images";
import { refreshIncidentsAround } from "@/lib/intel-server/incidents";
import { refreshIssueIntel } from "@/lib/intel-server/issue";
import { segmentKey } from "@/lib/intel/geo";
import { scoreVerification } from "@/lib/intel/verification";
import { blurPhoto, mlEnabled } from "@/lib/ml";
import { logEvent } from "@/lib/issue-detail";
import { latLngSchema } from "@/lib/reports";
import { PHOTO_BUCKET, supabaseAdmin } from "@/lib/supabase/server";
import { MAX_VERIFY_DISTANCE_M, type VerifyResult } from "@/lib/verify";

const MAX_BYTES = 15 * 1024 * 1024;

function fail(error: string, status: number) {
  return Response.json({ error }, { status });
}

export async function POST(request: Request, ctx: RouteContext<"/api/issues/[id]/verify">) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return fail("Invalid issue id", 400);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("Expected multipart form data", 400);
  }
  const photo = form.get("photo");
  if (!(photo instanceof File) || !photo.type.startsWith("image/")) return fail("Send one image as 'photo'", 400);
  if (photo.size > MAX_BYTES) return fail("Photo is larger than 15 MB", 413);
  const point = latLngSchema.safeParse({ lat: Number(form.get("lat")), lng: Number(form.get("lng")) });
  if (!point.success) return fail("Send valid 'lat' and 'lng'", 400);
  const { lat, lng } = point.data;
  const consent = form.get("consent") === "1" && mlEnabled();

  const original = Buffer.from(await photo.arrayBuffer());
  const takenAt = await photoTakenAt(original); // before EXIF is dropped
  let cleaned: Buffer;
  try {
    cleaned = await cleanForStorage(original);
  } catch {
    return fail("Could not read that image format", 415);
  }
  // F11: the after photo is blurred before it is stored or compared, like every report photo.
  let afterPhoto: Buffer;
  try {
    afterPhoto = await blurPhoto(cleaned);
  } catch (err) {
    console.error("Photo blurring failed:", err);
    return fail("The privacy blur is unavailable right now, so the photo was not stored. Try again in a moment.", 503);
  }

  const db = supabaseAdmin();
  const [{ data: firstReport }, { data: issueRow }] = await Promise.all([
    db.from("reports").select("photo_path").eq("issue_id", id).not("photo_path", "is", null).order("created_at").limit(1).maybeSingle<{ photo_path: string }>(),
    db.from("issues").select("created_at, segment_key").eq("id", id).maybeSingle<{ created_at: string; segment_key: string | null }>(),
  ]);
  if (!issueRow) return fail("Issue not found", 404);
  if (!firstReport) return fail("This issue has no photo to compare with yet", 409);

  // Claim: open -> fix_claimed in one update, so two checks cannot run at once.
  const { data: claimed } = await db.from("issues").update({ status: "fix_claimed" }).eq("id", id).eq("status", "open").select("id");
  if (!claimed?.length) {
    const { data: issue } = await db.from("issues").select("status").eq("id", id).maybeSingle<{ status: string }>();
    if (issue?.status === "verified") return fail("This issue is already verified as fixed", 409);
    return fail("A fix photo for this issue is already being checked, try again in a minute", 409);
  }
  await logEvent(id, "fix_claimed");

  let settled = false;
  try {
    const afterPath = `verifications/${crypto.randomUUID()}.jpg`;
    const [upload, before, distance, place] = await Promise.all([
      db.storage.from(PHOTO_BUCKET).upload(afterPath, afterPhoto, { contentType: "image/jpeg", upsert: false }),
      db.storage.from(PHOTO_BUCKET).download(firstReport.photo_path),
      db.rpc("distance_to_issue", { p_id: id, p_lng: lng, p_lat: lat }),
      reversePlace(lat, lng),
    ]);
    if (upload.error) throw new Error(`After photo upload failed: ${upload.error.message}`);
    if (before.error || !before.data) throw new Error("Could not load the original photo");
    if (typeof distance.data !== "number") throw new Error("Could not measure the distance");
    const distanceM = distance.data;
    const beforeBuf = Buffer.from(await before.data.arrayBuffer());

    // Before and after in one message, in that order; the layout comparison runs alongside.
    const [images, similarity] = await Promise.all([
      Promise.all([toModelImage(beforeBuf), toModelImage(afterPhoto)]),
      sceneSimilarity(beforeBuf, afterPhoto),
    ]);
    const verdict = await askVision(FIX_VERDICT_SYSTEM, FIX_VERDICT_USER, images, fixVerdictJsonSchema, fixVerdictSchema);

    const road = (key: string | null) => key?.split(":")[0] ?? null;
    const afterSegment = place.road ? segmentKey(place.road, { lat, lng }) : null;
    const sameSegment = issueRow.segment_key && afterSegment ? road(issueRow.segment_key) === road(afterSegment) : null;

    const scored = scoreVerification({
      distanceM,
      maxDistanceM: MAX_VERIFY_DISTANCE_M,
      sameSegment,
      modelSameLocation: verdict.same_location,
      modelSameRoad: verdict.same_road,
      sceneSimilarity: similarity,
      modelResolved: verdict.issue_resolved,
      modelConfidence: verdict.confidence,
      residualIssues: verdict.residual_issues,
      photoTakenAt: takenAt,
      issueCreatedAt: new Date(issueRow.created_at),
    });
    const passed = scored.outcome === "verified";
    const reason =
      distanceM > MAX_VERIFY_DISTANCE_M
        ? `The photo was taken ${Math.round(distanceM)} m away; it must be within ${MAX_VERIFY_DISTANCE_M} m of the issue.`
        : scored.outcome === "partial" && verdict.residual_issues.length
          ? `${verdict.reason} Still to do: ${verdict.residual_issues.join("; ")}.`
          : verdict.reason;

    const { error: insertError } = await db.from("verifications").insert({
      issue_id: id,
      after_photo_path: afterPath,
      location: `SRID=4326;POINT(${lng} ${lat})`,
      distance_m: distanceM,
      ai_verdict: verdict,
      passed,
      checks: scored.checks,
      score: scored.score,
      outcome: scored.outcome,
      // F14: consent counts only when the photo was blurred, which the service being on guarantees.
      ...(consent ? { dataset_consent: true } : {}),
    });
    if (insertError) throw new Error(`Saving the verification failed: ${insertError.message}`);

    if (passed) {
      await db.from("issues").update({ status: "verified", verified_at: new Date().toISOString(), stage: "ai_verified", priority: 0 }).eq("id", id);
      await logEvent(id, "verified", { reason, score: scored.score });
    } else if (scored.outcome === "partial") {
      await db.from("issues").update({ status: "open", stage: "repair" }).eq("id", id);
      await logEvent(id, "partially_resolved", { reason, score: scored.score, residual: verdict.residual_issues });
    } else {
      await db.from("issues").update({ status: "open" }).eq("id", id);
      await logEvent(id, "verification_failed", { reason, score: scored.score });
    }
    settled = true;

    // A fix can break up an incident and changes priorities nearby.
    afterResponse(async () => {
      await refreshIssueIntel(id).catch((e: unknown) => console.error(e));
      await refreshIncidentsAround(lat, lng).catch((e: unknown) => console.error(e));
    });

    const result: VerifyResult = {
      passed,
      distanceM: Math.round(distanceM),
      reason,
      sameLocation: verdict.same_location,
      issueResolved: verdict.issue_resolved,
      confidence: verdict.confidence,
      checks: scored.checks,
      score: scored.score,
      outcome: scored.outcome,
      headline: scored.headline,
      residualIssues: verdict.residual_issues,
    };
    return Response.json(result);
  } catch (err) {
    console.error(`Verification of issue ${id} failed:`, err);
    const message = err instanceof ModelReplyError ? "The model could not give a valid verdict, try again" : "Could not check the photo right now, try again";
    return fail(message, 502);
  } finally {
    // Any failure before a verdict puts the issue back to open, so it is never stuck.
    if (!settled) {
      await db.from("issues").update({ status: "open" }).eq("id", id).eq("status", "fix_claimed");
      await logEvent(id, "verification_failed", { reason: "The check could not be completed." });
    }
  }
}
