// POST /api/reports/analyze: the civic investigator (features 1, 11, 12 with F1, F2, F4, F5, F9, F11, F12, F13).
// Takes a photo, up to six frames of a short video, and/or a voice note transcript. Every image is
// cleaned and blurred before it is stored or read; the model turns all the evidence into one civic
// case with every problem found. Also geocodes the spot, estimates pothole depth, finds unverified
// issues within 30 m (same category, and any category with a similar summary), the corporation, any
// earlier repair here, and an active incident that covers the spot.
// Nothing is filed here; the user corrects the case first and then calls submit.
import { askVision, embed, issueEmbeddingText, ModelReplyError } from "@/lib/ai/ollama";
import { CASE_SYSTEM, caseUser } from "@/lib/ai/prompts";
import { caseReadingJsonSchema, caseReadingSchema, primaryReading, type CaseReading, type Category, type PhotoReading } from "@/lib/ai/schemas";
import { reversePlace } from "@/lib/geocode";
import { cleanForStorage, toModelImage } from "@/lib/images";
import { haversineM } from "@/lib/intel/geo";
import { blurPhoto, estimateDepth } from "@/lib/ml";
import {
  EMBED_MATCH_MAX_DISTANCE,
  latLngSchema,
  MAX_FRAMES,
  MERGE_RADIUS_M,
  TRANSCRIPT_MAX,
  type AnalyzeResult,
  type MediaKind,
  type NearbyIssue,
  type SimilarIssue,
} from "@/lib/reports";
import { isCorporationId } from "@/lib/routing";
import { PHOTO_BUCKET, photoPublicUrl, supabaseAdmin } from "@/lib/supabase/server";

const MAX_BYTES = 15 * 1024 * 1024;

function fail(error: string, status: number) {
  return Response.json({ error }, { status });
}

async function readCase(images: string[], transcript: string | null, language: string | null): Promise<CaseReading | null> {
  if (!images.length && !transcript) return null;
  try {
    return await askVision(CASE_SYSTEM, caseUser({ images: images.length, transcript, language }), images, caseReadingJsonSchema, caseReadingSchema);
  } catch (err) {
    // Invalid twice, Ollama down or timed out: the report still goes through with a manual category.
    console.error("Case extraction failed:", err instanceof ModelReplyError ? err.lastReply : err);
    return null;
  }
}

/** F12: issues within 30 m whose summary means nearly the same, whatever their category. */
async function findSimilar(reading: PhotoReading | null, lat: number, lng: number): Promise<SimilarIssue[]> {
  if (!reading?.is_civic_issue) return [];
  try {
    const vector = await embed(issueEmbeddingText(reading.category, reading.summary));
    const { data, error } = await supabaseAdmin().rpc("similar_unverified_issues", {
      p_lng: lng,
      p_lat: lat,
      p_embedding: JSON.stringify(vector),
      p_radius_m: MERGE_RADIUS_M,
    });
    if (error) throw error;
    return ((data ?? []) as (NearbyRow & { cosine_distance: number })[])
      .filter((r) => r.cosine_distance <= EMBED_MATCH_MAX_DISTANCE)
      .map((r) => ({ ...toNearby(r), cosineDistance: Math.round(r.cosine_distance * 1000) / 1000 }));
  } catch (err) {
    console.error("Embedding match failed:", err);
    return [];
  }
}

/** Feature 7: verified repairs of the same kind within 40 m, newest first. */
async function repairedHere(lat: number, lng: number, category: Category): Promise<{ id: number; verified_at: string | null }[]> {
  const { data } = await supabaseAdmin().rpc("verified_nearby", { p_lng: lng, p_lat: lat, p_category: category, p_radius_m: 40 });
  return (data ?? []) as { id: number; verified_at: string | null }[];
}

/** Cleans, blurs and stores one image; returns its path and the stored bytes. */
async function store(file: File, path: string): Promise<{ path: string; buf: Buffer }> {
  const cleaned = await cleanForStorage(Buffer.from(await file.arrayBuffer()));
  const buf = await blurPhoto(cleaned); // F11: only the blurred image is ever stored or read by a model
  const { error } = await supabaseAdmin().storage.from(PHOTO_BUCKET).upload(path, buf, { contentType: "image/jpeg", upsert: false });
  if (error) throw new Error(`upload failed: ${error.message}`);
  return { path, buf };
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("Expected multipart form data", 400);
  }

  const point = latLngSchema.safeParse({ lat: Number(form.get("lat")), lng: Number(form.get("lng")) });
  if (!point.success) return fail("Send valid 'lat' and 'lng'", 400);
  const { lat, lng } = point.data;
  const rawTranscript = form.get("transcript");
  const transcript = typeof rawTranscript === "string" && rawTranscript.trim() ? rawTranscript.trim().slice(0, TRANSCRIPT_MAX) : null;
  const rawLanguage = form.get("language");
  const language = typeof rawLanguage === "string" && /^[a-z]{2,3}$/.test(rawLanguage) ? rawLanguage : null;

  const photo = form.get("photo");
  const frameFiles = form.getAll("frames").filter((f): f is File => f instanceof File).slice(0, MAX_FRAMES);
  const frameTimes = form.getAll("frameTimes").map(Number).slice(0, MAX_FRAMES);
  const files = frameFiles.length ? frameFiles : photo instanceof File ? [photo] : [];
  for (const f of files) {
    if (!f.type.startsWith("image/")) return fail("Photos and video frames must be images", 400);
    if (f.size > MAX_BYTES) return fail("An image is larger than 15 MB", 413);
  }
  if (!files.length && !transcript) return fail("Send a photo, a short video or a voice note", 400);
  const media: MediaKind = frameFiles.length ? "video" : files.length ? "photo" : "voice";

  // Store every image (blurred) in parallel; a video's frames share one id.
  const id = crypto.randomUUID();
  let stored: { path: string; buf: Buffer }[];
  try {
    stored = await Promise.all(files.map((f, i) => store(f, media === "video" ? `reports/${id}-f${i}.jpg` : `reports/${id}.jpg`)));
  } catch (err) {
    console.error("Storing the evidence failed:", err);
    const msg = String(err);
    if (msg.includes("ML service")) return fail("The privacy blur is unavailable right now, so nothing was stored. Try again in a moment.", 503);
    if (msg.includes("upload failed")) return fail("Could not store the evidence, try again", 502);
    return fail("Could not read that image format", 415);
  }

  const db = supabaseAdmin();
  const casePromise = Promise.all(stored.map((s) => toModelImage(s.buf))).then((images) => readCase(images, transcript, language));
  const [caseReading, place, nearby, located, recurrence, incidentPoints] = await Promise.all([
    casePromise,
    reversePlace(lat, lng),
    db.rpc("nearby_unverified_issues", { p_lng: lng, p_lat: lat, p_radius_m: MERGE_RADIUS_M }),
    db.rpc("locate_point", { p_lng: lng, p_lat: lat }),
    casePromise.then((c) => (c ? repairedHere(lat, lng, c.issues[0]!.category) : [])),
    db.rpc("incident_points"),
  ]);
  const reading = caseReading ? primaryReading(caseReading) : null;

  // The main image is the frame that best shows the main problem.
  const mainFrame = caseReading?.issues[0]?.frames[0];
  const main = stored[mainFrame !== undefined && mainFrame < stored.length ? mainFrame : 0] ?? null;
  const [similar, depthClass] = await Promise.all([
    findSimilar(reading, lat, lng),
    main && reading?.category === "pothole" ? estimateDepth(main.buf) : Promise.resolve(null),
  ]);

  if (nearby.error) console.error("nearby_unverified_issues failed:", nearby.error);
  if (located.error) console.error("locate_point failed:", located.error);

  // An active incident whose circle covers this spot.
  let incident: AnalyzeResult["incident"] = null;
  const points = (incidentPoints.data ?? []) as { id: number; lat: number; lng: number }[];
  const close = points.filter((p) => haversineM(p, { lat, lng }) <= 1500).map((p) => p.id);
  if (close.length) {
    const { data: incs } = await db.from("incidents").select("id, title, report_count, radius_m, status").in("id", close).eq("status", "active");
    const hit = (incs ?? []).find((i) => {
      const p = points.find((x) => x.id === i.id)!;
      return haversineM(p, { lat, lng }) <= (i.radius_m as number) + 100;
    });
    if (hit) incident = { id: hit.id as number, title: hit.title as string, reportCount: hit.report_count as number };
  }

  const prev = recurrence.find((r) => r.verified_at);
  const corporation = (located.data as { corporation_id: string | null }[] | null)?.[0]?.corporation_id;
  const result: AnalyzeResult = {
    photoPath: main?.path ?? null,
    photoUrl: main ? photoPublicUrl(main.path) : null,
    frames: media === "video" ? stored.map((s, i) => ({ path: s.path, url: photoPublicUrl(s.path), time: Number.isFinite(frameTimes[i]) ? frameTimes[i]! : null })) : [],
    media,
    address: place.address,
    road: place.road,
    roadClass: place.roadClass,
    case: caseReading,
    reading,
    transcript,
    language,
    nearby: ((nearby.data ?? []) as NearbyRow[]).map(toNearby),
    similar,
    corporationId: isCorporationId(corporation) ? corporation : null,
    depthClass,
    recurrence: prev
      ? { issueId: prev.id, repairedOn: prev.verified_at!.slice(0, 10), daysAgo: Math.round((Date.now() - new Date(prev.verified_at!).getTime()) / 86_400_000) }
      : null,
    incident,
  };
  return Response.json(result);
}

type NearbyRow = {
  id: number;
  category: Category;
  summary: string;
  backer_count: number;
  distance_m: number;
  photo_path: string | null;
};

function toNearby(n: NearbyRow): NearbyIssue {
  return {
    id: n.id,
    category: n.category,
    summary: n.summary,
    backerCount: n.backer_count,
    distanceM: Math.round(n.distance_m),
    photoUrl: n.photo_path ? photoPublicUrl(n.photo_path) : null,
  };
}
