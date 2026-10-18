import { z } from "zod";
import { ACCESSIBILITY, CATEGORIES, caseReadingSchema, followUpAnswerSchema, photoReadingSchema, type CaseReading, type Category, type PhotoReading } from "@/lib/ai/schemas";
import { CORPORATION_IDS, type CorporationId } from "@/lib/routing";

/** Storage path of a cleaned report photo or video frame, as written by the analyze route. */
export const REPORT_PHOTO_PATH = /^reports\/[0-9a-f-]{36}(-f\d)?\.jpg$/;

/** F13: rough pothole depth classes from relative depth; always shown as "estimated". */
export const DEPTH_CLASSES = ["shallow", "moderate", "deep"] as const;
export type DepthClass = (typeof DEPTH_CLASSES)[number];

/** Longest voice note transcript kept (F9); 30 s of speech fits well inside it. */
export const TRANSCRIPT_MAX = 600;

/** Video frames the browser sends for one case (feature 1). */
export const MAX_FRAMES = 6;

/** Duplicate merge radius (F4). */
export const MERGE_RADIUS_M = 30;

/** Languages the voice flow understands and answers in (feature 12). */
export const LANGUAGES = ["en", "hi", "kn", "ta", "te"] as const;
export type Language = (typeof LANGUAGES)[number];

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

export type MediaKind = "photo" | "video" | "voice";

/** Reply of POST /api/reports/analyze. */
export type AnalyzeResult = {
  /** The main stored image (the photo, or the frame that best shows the main problem); null for voice only. */
  photoPath: string | null;
  photoUrl: string | null;
  /** Stored video frames, in time order (feature 1). */
  frames: { path: string; url: string; time: number | null }[];
  media: MediaKind;
  address: string | null;
  road: string | null;
  roadClass: string | null;
  /** The full civic case (features 1, 11, 12), or null when the model failed. */
  case: CaseReading | null;
  /** The case's main problem in the single-reading shape, or null when the model failed. */
  reading: PhotoReading | null;
  transcript: string | null;
  language: string | null;
  /** Nearest first. The "Same problem?" step shows the one with the chosen category. */
  nearby: NearbyIssue[];
  /** F12: closest meaning first, already under the match threshold. */
  similar: SimilarIssue[];
  /** From the boundary lookup; null when boundaries are missing, so the user picks one (F5). */
  corporationId: CorporationId | null;
  /** F13: estimated pothole depth; shown only when the category is pothole. Null when unavailable. */
  depthClass: DepthClass | null;
  /** Feature 7: this spot was repaired before and the problem is back. */
  recurrence: { issueId: number; repairedOn: string; daysAgo: number } | null;
  /** Feature 3: an active incident that covers this spot. */
  incident: { id: number; title: string; reportCount: number } | null;
};

export const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const issueInput = z.object({
  category: z.enum(CATEGORIES),
  severity: z.number().int().min(1).max(5),
  summary: z.string().trim().min(1).max(120),
  frames: z.array(z.number().int().min(0).max(9)).max(4).default([]),
});

/** Body of POST /api/reports/submit. */
export const submitBodySchema = latLngSchema
  .extend({
    photoPath: z.string().regex(REPORT_PHOTO_PATH).nullable().default(null),
    framePaths: z.array(z.string().regex(REPORT_PHOTO_PATH)).max(MAX_FRAMES).default([]),
    frameTimes: z.array(z.number().min(0).max(120)).max(MAX_FRAMES).default([]),
    media: z.enum(["photo", "video", "voice"]).default("photo"),
    /** Every problem in the case, main one first (features 1, 11). */
    issues: z.array(issueInput).min(1).max(5).optional(),
    /** Single-issue form, kept for older clients. */
    category: z.enum(CATEGORIES).optional(),
    severity: z.number().int().min(1).max(5).optional(),
    summary: z.string().trim().min(1).max(120).optional(),
    /** The raw case reading, stored as reports.extraction; null when the model failed. */
    case: caseReadingSchema.nullable().default(null),
    /** The single reading, stored as reports.ai_result. */
    ai: photoReadingSchema.nullable().default(null),
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
    language: z.string().trim().max(8).nullable().default(null),
    summaryLocal: z.string().trim().max(200).nullable().default(null),
    /** F13: estimated depth class for a pothole, as shown (and maybe corrected) on the result card. */
    depthClass: z.enum(DEPTH_CLASSES).nullable().default(null),
    /** F14: allow this blurred photo in the open dataset. */
    datasetConsent: z.boolean().default(false),
    accessibility: z.enum(ACCESSIBILITY).default("none"),
    gpsAccuracyM: z.number().min(0).max(10_000).nullable().default(null),
    road: z.string().trim().max(120).nullable().default(null),
    roadClass: z.string().trim().max(40).nullable().default(null),
    address: z.string().trim().max(300).nullable().default(null),
    /** Answers to the follow-up questions; the duration answer sets duration_claim_days. */
    followUp: z.array(followUpAnswerSchema).max(6).default([]),
  })
  .refine((b) => b.issues || (b.category && b.severity && b.summary), { message: "Send issues, or category, severity and summary" })
  .refine((b) => b.photoPath || b.media === "voice", { message: "A photo or video is needed unless this is a voice report" });
export type SubmitBody = z.input<typeof submitBodySchema>;

/** Reply of POST /api/reports/submit. */
export type SubmitResult = {
  issueId: number;
  merged: boolean;
  backerCount: number;
  /** The body the issue is routed to (F5). */
  bodyName: string | null;
  /** Every issue this case filed or backed, main one first. */
  linked: { issueId: number; category: Category; merged: boolean }[];
  /** Feature 7: the main problem is back after a repair. */
  recurrence: { previousIssueId: number; lastedDays: number } | null;
};
