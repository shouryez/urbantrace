// POST /api/issues/[id]/verify (F7): after photo, GPS check, Job 3, status change.
// The issue is fix_claimed while the photo is checked; only one check runs per issue at a time.
import { askVision, ModelReplyError } from "@/lib/ai/ollama";
import { FIX_VERDICT_SYSTEM, FIX_VERDICT_USER } from "@/lib/ai/prompts";
import { fixVerdictJsonSchema, fixVerdictSchema } from "@/lib/ai/schemas";
import { cleanForStorage, toModelImage } from "@/lib/images";
import { blurPhoto, mlEnabled } from "@/lib/ml";
import { logEvent } from "@/lib/issue-detail";
import { latLngSchema } from "@/lib/reports";
import { PHOTO_BUCKET, supabaseAdmin } from "@/lib/supabase/server";
import { MAX_VERIFY_DISTANCE_M, passesVerification, type VerifyResult } from "@/lib/verify";

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

  let cleaned: Buffer;
  try {
    cleaned = await cleanForStorage(Buffer.from(await photo.arrayBuffer()));
  } catch {
    return fail("Could not read that image format", 415);
  }
  // F11: the after photo is blurred before it is stored or compared, like every report photo.
  let after: Buffer;
  try {
    after = await blurPhoto(cleaned);
  } catch (err) {
    console.error("Photo blurring failed:", err);
    return fail("The privacy blur is unavailable right now, so the photo was not stored. Try again in a moment.", 503);
  }

  const db = supabaseAdmin();
  const { data: firstReport } = await db
    .from("reports")
    .select("photo_path")
    .eq("issue_id", id)
    .order("created_at")
    .limit(1)
    .maybeSingle<{ photo_path: string }>();
  if (!firstReport) return fail("Issue not found", 404);

  // Claim: open -> fix_claimed in one update, so two checks cannot run at once.
  const { data: claimed } = await db
    .from("issues")
    .update({ status: "fix_claimed" })
    .eq("id", id)
    .eq("status", "open")
    .select("id");
  if (!claimed?.length) {
    const { data: issue } = await db.from("issues").select("status").eq("id", id).maybeSingle<{ status: string }>();
    if (issue?.status === "verified") return fail("This issue is already verified as fixed", 409);
    return fail("A fix photo for this issue is already being checked, try again in a minute", 409);
  }
  await logEvent(id, "fix_claimed");

  let settled = false;
  try {
    const afterPath = `verifications/${crypto.randomUUID()}.jpg`;
    const [upload, before, distance] = await Promise.all([
      db.storage.from(PHOTO_BUCKET).upload(afterPath, after, { contentType: "image/jpeg", upsert: false }),
      db.storage.from(PHOTO_BUCKET).download(firstReport.photo_path),
      db.rpc("distance_to_issue", { p_id: id, p_lng: lng, p_lat: lat }),
    ]);
    if (upload.error) throw new Error(`After photo upload failed: ${upload.error.message}`);
    if (before.error || !before.data) throw new Error("Could not load the original photo");
    if (typeof distance.data !== "number") throw new Error("Could not measure the distance");
    const distanceM = distance.data;

    // Before and after in one message, in that order.
    const images = await Promise.all([toModelImage(Buffer.from(await before.data.arrayBuffer())), toModelImage(after)]);
    const verdict = await askVision(FIX_VERDICT_SYSTEM, FIX_VERDICT_USER, images, fixVerdictJsonSchema, fixVerdictSchema);
    const passed = passesVerification(distanceM, verdict);
    const reason =
      distanceM > MAX_VERIFY_DISTANCE_M
        ? `The photo was taken ${Math.round(distanceM)} m away; it must be within ${MAX_VERIFY_DISTANCE_M} m of the issue.`
        : verdict.reason;

    const { error: insertError } = await db.from("verifications").insert({
      issue_id: id,
      after_photo_path: afterPath,
      location: `SRID=4326;POINT(${lng} ${lat})`,
      distance_m: distanceM,
      ai_verdict: verdict,
      passed,
      // F14: consent counts only when the photo was blurred, which the service being on guarantees.
      ...(consent ? { dataset_consent: true } : {}),
    });
    if (insertError) throw new Error(`Saving the verification failed: ${insertError.message}`);

    if (passed) {
      await db.from("issues").update({ status: "verified", verified_at: new Date().toISOString() }).eq("id", id);
      await logEvent(id, "verified", { reason });
    } else {
      await db.from("issues").update({ status: "open" }).eq("id", id);
      await logEvent(id, "verification_failed", { reason });
    }
    settled = true;

    const result: VerifyResult = {
      passed,
      distanceM: Math.round(distanceM),
      reason,
      sameLocation: verdict.same_location,
      issueResolved: verdict.issue_resolved,
      confidence: verdict.confidence,
    };
    return Response.json(result);
  } catch (err) {
    console.error(`Verification of issue ${id} failed:`, err);
    const message =
      err instanceof ModelReplyError
        ? "The model could not give a valid verdict, try again"
        : "Could not check the photo right now, try again";
    return fail(message, 502);
  } finally {
    // Any failure before a verdict puts the issue back to open, so it is never stuck.
    if (!settled) {
      await db.from("issues").update({ status: "open" }).eq("id", id).eq("status", "fix_claimed");
      await logEvent(id, "verification_failed", { reason: "The check could not be completed." });
    }
  }
}
