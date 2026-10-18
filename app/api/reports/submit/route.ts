// POST /api/reports/submit: files a civic case (F2, F4, F5, F6, F9, F12, F13, F14; features 1, 3, 5, 7, 8, 9, 11, 16, 17).
// Every problem in the case goes through submit_report, which merges it into an unverified issue of
// the same category within 30 m (or the confirmed target) or creates a new one. New issues are
// routed. After the reply: the case file and letter, embeddings, the issue's intelligence
// (recurrence, evidence, priority, assignment), incident clustering around the spot and alerts.
import { after } from "next/server";
import { currentAccount } from "@/lib/account";
import { embed, issueEmbeddingText } from "@/lib/ai/ollama";
import { DURATION_DAYS, DURATION_QUESTION, type Category } from "@/lib/ai/schemas";
import { reverseGeocode } from "@/lib/geocode";
import { refreshAlerts, refreshIncidentsAround } from "@/lib/intel-server/incidents";
import { refreshIssueIntel } from "@/lib/intel-server/issue";
import { parseDurationClaim } from "@/lib/intel/evidence";
import { segmentKey } from "@/lib/intel/geo";
import { logEvent } from "@/lib/issue-detail";
import { generateLetter, requestOrigin } from "@/lib/letter";
import { mlEnabled } from "@/lib/ml";
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
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid report", 400);
  const body = parsed.data;
  const db = supabaseAdmin();

  // One entry per kind of problem, main one first.
  const all = body.issues ?? [{ category: body.category!, severity: body.severity!, summary: body.summary!, frames: [] }];
  const issues = all.filter((p, i) => all.findIndex((q) => q.category === p.category) === i);

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

  // The reporter's own answer wins over what the model guessed from the evidence.
  const durationAnswer = body.followUp.find((a) => a.question === DURATION_QUESTION.question)?.answer;
  const durationDays = (durationAnswer ? DURATION_DAYS[durationAnswer] : undefined) ?? parseDurationClaim(body.case?.duration_claim) ?? parseDurationClaim(body.transcript);
  const account = await currentAccount().catch(() => null);
  const consent = body.datasetConsent && mlEnabled(); // F14: only blurred photos, which the service guarantees
  const segment = segmentKey(body.road, body);
  const address = body.address ?? (await reverseGeocode(body.lat, body.lng));

  const linked: SubmitResult["linked"] = [];
  for (const [i, problem] of issues.entries()) {
    const primary = i === 0;
    // The frame that shows this problem, else the main image.
    const frame = problem.frames.find((f) => f < body.framePaths.length);
    const photoPath = frame !== undefined ? body.framePaths[frame]! : body.photoPath;
    const { data, error } = await db
      .rpc("submit_report", {
        p_category: problem.category,
        p_severity: problem.severity,
        p_summary: problem.summary,
        p_lng: body.lng,
        p_lat: body.lat,
        p_photo_path: photoPath,
        p_ai: body.ai ?? (body.case ? { case: true } : { manual: true }),
        p_device: body.deviceId,
        p_force_new: primary ? body.forceNew : false,
        p_target_issue_id: primary ? body.targetIssueId : null,
      })
      .single<SubmitReportRow>();
    if (error || !data) {
      console.error("submit_report failed:", error);
      if (primary) return fail("Could not file the report, try again", 502);
      continue;
    }
    const issueId = data.out_issue_id;
    linked.push({ issueId, category: problem.category, merged: data.out_merged });

    await db
      .from("reports")
      .update({
        user_edited: body.userEdited,
        transcript: body.transcript,
        extraction: body.case || body.followUp.length ? { ...(body.case ?? {}), follow_up: body.followUp } : null,
        language: body.language,
        summary_local: primary ? body.summaryLocal : null,
        severity_opinion: body.userEdited ? problem.severity : null,
        gps_accuracy_m: body.gpsAccuracyM,
        duration_claim_days: durationDays,
        ...(account ? { user_id: account.id } : {}),
        media: { kind: body.media, frames: body.framePaths, frame_times: body.frameTimes, lat: body.lat, lng: body.lng },
        ...(consent ? { dataset_consent: true } : {}),
      })
      .match({ issue_id: issueId, device_id: body.deviceId });

    // Accessibility (feature 10) applies to footpath-type problems and to whatever the main problem is.
    const accessibility = primary || problem.category === "footpath" || problem.category === "drainage" ? body.accessibility : "none";
    const updates: Record<string, unknown> = {};
    if (!data.out_merged) {
      updates.road_class = body.roadClass;
      updates.segment_key = segment;
      if (address) updates.address = address;
    }
    if (accessibility !== "none") updates.accessibility = accessibility;
    // F13: a pothole's estimated depth; a merge only fills it in when the issue has none yet.
    if (problem.category === "pothole" && body.depthClass) updates.depth_class = body.depthClass;
    if (Object.keys(updates).length) {
      let q = db.from("issues").update(updates).eq("id", issueId);
      if (data.out_merged && updates.depth_class) q = q.is("depth_class", null);
      const { error: upErr } = await q;
      if (upErr) console.error(`Updating issue ${issueId} failed:`, upErr);
    }

    if (!data.out_merged) {
      await routeNewIssue(issueId, problem.category, body);
      await logEvent(issueId, "triaged", { media: body.media, problems: issues.length, language: body.language });
    }
  }

  const main = linked[0]!;
  const origin = requestOrigin(request);
  const newIds = linked.filter((l) => !l.merged).map((l) => l.issueId);
  // New answers about an existing issue are worth a fresh case file and letter too.
  const letterIds = [...newIds, ...linked.filter((l) => l.merged && body.followUp.length).map((l) => l.issueId)];

  // Recurrence and priority now, so the success screen can say "this is back".
  await refreshIssueIntel(main.issueId);
  const { data: mainRow } = await db
    .from("issues")
    .select("backer_count, agency, corporation_id, recurrence_of, repair_lasted_days")
    .eq("id", main.issueId)
    .single<{ backer_count: number; agency: Agency | null; corporation_id: string | null; recurrence_of: number | null; repair_lasted_days: number | null }>();

  after(async () => {
    for (const l of linked.slice(1)) await refreshIssueIntel(l.issueId).catch((e: unknown) => console.error(e));
    try {
      await refreshIncidentsAround(body.lat, body.lng);
      await refreshAlerts();
    } catch (err) {
      console.error("Incident detection failed:", err);
    }
    for (const id of newIds) {
      const problem = issues[linked.findIndex((l) => l.issueId === id)]!;
      try {
        const vector = await embed(issueEmbeddingText(problem.category, problem.summary));
        await db.from("issues").update({ embedding: JSON.stringify(vector) }).eq("id", id);
      } catch (err) {
        console.error(`Embedding for issue ${id} failed:`, err);
      }
    }
    // F6 and feature 17: the case file and letter, after the analysis so it can cite it.
    for (const id of letterIds) {
      try {
        await generateLetter(id, origin);
      } catch (err) {
        console.error(`Case file for issue ${id} failed:`, err);
      }
    }
  });

  const result: SubmitResult = {
    issueId: main.issueId,
    merged: main.merged,
    backerCount: mainRow?.backer_count ?? 1,
    bodyName: mainRow?.agency ? responsibleBody(mainRow.agency, mainRow.corporation_id) : null,
    linked,
    recurrence:
      mainRow?.recurrence_of && mainRow.repair_lasted_days !== null
        ? { previousIssueId: mainRow.recurrence_of, lastedDays: mainRow.repair_lasted_days }
        : null,
  };
  return Response.json(result);
}

/**
 * F5: agency by category; for corporation issues, the corporation and ward from the boundaries,
 * falling back to the user's pick. Saves them and logs a routed event.
 */
async function routeNewIssue(issueId: number, category: Category, body: { lat: number; lng: number; corporationId: string | null }): Promise<void> {
  const db = supabaseAdmin();
  const agency = agencyFor(category);
  let corporationId: string | null = null;
  let wardId: number | null = null;
  if (agency === "corporation") {
    const { data } = await db.rpc("locate_point", { p_lng: body.lng, p_lat: body.lat });
    const located = (data as { corporation_id: string | null; ward_id: number | null }[] | null)?.[0];
    corporationId = located?.corporation_id ?? (isCorporationId(body.corporationId) ? body.corporationId : null);
    wardId = located?.ward_id ?? null;
  }
  const bodyName = responsibleBody(agency, corporationId);
  const { error } = await db.from("issues").update({ agency, corporation_id: corporationId, ward_id: wardId, stage: "routed" }).eq("id", issueId);
  if (error) console.error(`Routing issue ${issueId} failed:`, error);
  await logEvent(issueId, "routed", { agency, corporation_id: corporationId, body: bodyName });
}
