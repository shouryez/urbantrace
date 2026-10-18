import { z } from "zod";
import { CATEGORIES, photoReadingSchema, type Category, type PhotoReading } from "@/lib/ai/schemas";
import { CORPORATION_IDS, type CorporationId } from "@/lib/routing";

/** Storage path of a cleaned report photo, as written by the analyze route. */
export const REPORT_PHOTO_PATH = /^reports\/[0-9a-f-]{36}\.jpg$/;

/** F13: rough pothole depth classes from relative depth; always shown as "estimated". */
export const DEPTH_CLASSES = ["shallow", "moderate", "deep"] as const;
export type DepthClass = (typeof DEPTH_CLASSES)[number];

/** Longest voice note transcript kept (F9); 30 s of speech fits well inside it. */
export const TRANSCRIPT_MAX = 600;

/** Duplicate merge radius (F4). */
export const MERGE_RADIUS_M = 30;

/** An unverified issue within 30 m of the report, any category (F4). */
export type NearbyIssue = {
  id: number;
  category: Category;
  summary: string;
  backerCount: number;
  distanceM: number;
  photoUrl: string | null;
};

/**
 * F12: an unverified issue within 30 m of any category whose summary means nearly the same thing.
 * Catches duplicates that F4 misses because the model labelled them differently.
 */
export type SimilarIssue = NearbyIssue & { cosineDistance: number };

/** F12: cosine distance at or below which a nearby issue is offered as "the same?". Tune on the test photos. */
export const EMBED_MATCH_MAX_DISTANCE = 0.3;

/** Reply of POST /api/reports/analyze. */
export type AnalyzeResult = {
  photoPath: string;
  photoUrl: string;
  address: string | null;
  /** Job 1 reading, or null when the model failed and the user picks the category by hand. */
  reading: PhotoReading | null;
  /** Nearest first. The "Same problem?" step shows the one with the chosen category. */
  nearby: NearbyIssue[];
  /** F12: closest meaning first, already under the match threshold. */
  similar: SimilarIssue[];
  /** From the boundary lookup; null when boundaries are missing, so the user picks one (F5). */
  corporationId: CorporationId | null;
  /** F13: estimated pothole depth; shown only when the category is pothole. Null when unavailable. */
  depthClass: DepthClass | null;
};

export const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/** Body of POST /api/reports/submit. */
export const submitBodySchema = latLngSchema.extend({
  photoPath: z.string().regex(REPORT_PHOTO_PATH),
  category: z.enum(CATEGORIES),
  severity: z.number().int().min(1).max(5),
  summary: z.string().trim().min(1).max(120),
  /** The raw Job 1 reading, stored as reports.ai_result; null when the model failed. */
  ai: photoReadingSchema.nullable(),
  userEdited: z.boolean(),
  deviceId: z.uuid(),
  /** User tapped "No, it's different". */
  forceNew: z.boolean().default(false),
  /** User tapped "Yes, add my support" or came from "I see this too"; checked to be within 30 m. */
  targetIssueId: z.number().int().positive().nullable().default(null),
  /** User's pick when the boundary lookup found no corporation. */
  corporationId: z.enum(CORPORATION_IDS).nullable().default(null),
  /** F9: the voice note transcript, if any. */
  transcript: z.string().trim().max(TRANSCRIPT_MAX).nullable().default(null),
  /** F13: estimated depth class for a pothole, as shown (and maybe corrected) on the result card. */
  depthClass: z.enum(DEPTH_CLASSES).nullable().default(null),
  /** F14: allow this blurred photo in the open dataset. */
  datasetConsent: z.boolean().default(false),
});
export type SubmitBody = z.input<typeof submitBodySchema>;

/** Reply of POST /api/reports/submit. */
export type SubmitResult = {
  issueId: number;
  merged: boolean;
  backerCount: number;
  /** The body the issue is routed to (F5). */
  bodyName: string | null;
};
