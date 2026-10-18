// POST /api/reports/analyze (F1, F2, F4, F5, F9, F11, F12, F13): clean, blur and store the photo, run Job 1
// (with the voice note transcript as context), geocode, estimate pothole depth, find unverified issues
// within 30 m (same category, and any category with a similar summary) and the corporation covering the point.
// Nothing is filed here; the user corrects the reading first and then calls submit.
import { askVision, embed, issueEmbeddingText, ModelReplyError } from "@/lib/ai/ollama";
import { PHOTO_READING_SYSTEM, photoReadingUser } from "@/lib/ai/prompts";
import { photoReadingJsonSchema, photoReadingSchema, type Category, type PhotoReading } from "@/lib/ai/schemas";
import { reverseGeocode } from "@/lib/geocode";
import { cleanForStorage, toModelImage } from "@/lib/images";
import { blurPhoto, estimateDepth } from "@/lib/ml";
import {
  EMBED_MATCH_MAX_DISTANCE,
  latLngSchema,
  MERGE_RADIUS_M,
  TRANSCRIPT_MAX,
  type AnalyzeResult,
  type NearbyIssue,
  type SimilarIssue,
} from "@/lib/reports";
import { isCorporationId } from "@/lib/routing";
import { PHOTO_BUCKET, photoPublicUrl, supabaseAdmin } from "@/lib/supabase/server";

const MAX_BYTES = 15 * 1024 * 1024;

function fail(error: string, status: number) {
  return Response.json({ error }, { status });
}

async function readPhoto(image: string, transcript: string | null): Promise<PhotoReading | null> {
  try {
    return await askVision(PHOTO_READING_SYSTEM, photoReadingUser(transcript), [image], photoReadingJsonSchema, photoReadingSchema);
  } catch (err) {
    // Invalid twice, Ollama down or timed out: the report still goes through with a manual category.
    console.error("Job 1 failed:", err instanceof ModelReplyError ? err.lastReply : err);
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

export async function POST(request: Request) {
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
  const rawTranscript = form.get("transcript");
  const transcript = typeof rawTranscript === "string" && rawTranscript.trim() ? rawTranscript.trim().slice(0, TRANSCRIPT_MAX) : null;

  let cleaned: Buffer;
  try {
    cleaned = await cleanForStorage(Buffer.from(await photo.arrayBuffer()));
  } catch (err) {
    console.error("Photo cleanup failed:", err);
    return fail("Could not read that image format", 415);
  }
  // F11: only the blurred photo is ever stored or read by a model.
  let stored: Buffer;
  try {
    stored = await blurPhoto(cleaned);
  } catch (err) {
    console.error("Photo blurring failed:", err);
    return fail("The privacy blur is unavailable right now, so the photo was not stored. Try again in a moment.", 503);
  }

  const photoPath = `reports/${crypto.randomUUID()}.jpg`;
  const upload = supabaseAdmin()
    .storage.from(PHOTO_BUCKET)
    .upload(photoPath, stored, { contentType: "image/jpeg", upsert: false });

  const db = supabaseAdmin();
  const readingPromise = toModelImage(stored).then((image) => readPhoto(image, transcript));
  const [uploadResult, reading, address, nearby, located, depthClass, similar] = await Promise.all([
    upload,
    readingPromise,
    reverseGeocode(lat, lng),
    db.rpc("nearby_unverified_issues", { p_lng: lng, p_lat: lat, p_radius_m: MERGE_RADIUS_M }),
    db.rpc("locate_point", { p_lng: lng, p_lat: lat }),
    estimateDepth(stored),
    readingPromise.then((r) => findSimilar(r, lat, lng)),
  ]);

  if (uploadResult.error) {
    console.error("Photo upload failed:", uploadResult.error);
    return fail("Could not store the photo, try again", 502);
  }
  if (nearby.error) console.error("nearby_unverified_issues failed:", nearby.error);
  if (located.error) console.error("locate_point failed:", located.error);

  const corporation = (located.data as { corporation_id: string | null }[] | null)?.[0]?.corporation_id;
  const result: AnalyzeResult = {
    photoPath,
    photoUrl: photoPublicUrl(photoPath),
    address,
    reading,
    nearby: ((nearby.data ?? []) as NearbyRow[]).map(toNearby),
    similar,
    corporationId: isCorporationId(corporation) ? corporation : null,
    depthClass,
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
