import { z } from "zod";

// Mirrors the issue_category and issue_status enums in supabase/migrations/0001_schema.sql.
export const CATEGORIES = [
  "pothole",
  "garbage",
  "streetlight",
  "waterlogging",
  "water_leak_sewage",
  "power_hazard",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Plain words for each category, for the UI and the complaint letter. */
export const CATEGORY_LABELS: Record<Category, string> = {
  pothole: "Pothole",
  garbage: "Garbage",
  streetlight: "Streetlight",
  waterlogging: "Waterlogging",
  water_leak_sewage: "Water leak or sewage",
  power_hazard: "Power line hazard",
  other: "Other",
};

export const STATUSES = ["open", "fix_claimed", "verified"] as const;
export type Status = (typeof STATUSES)[number];

// Job 1: read the photo (F2)

/** JSON schema sent to Ollama as `format` (structured output). */
export const photoReadingJsonSchema = {
  type: "object",
  properties: {
    is_civic_issue: { type: "boolean" },
    category: { enum: [...CATEGORIES] },
    severity: { type: "integer", minimum: 1, maximum: 5 },
    summary: { type: "string", maxLength: 120 },
  },
  required: ["is_civic_issue", "category", "severity", "summary"],
} as const;

/** Zod check applied to every Job 1 reply. */
export const photoReadingSchema = z.object({
  is_civic_issue: z.boolean(),
  category: z.enum(CATEGORIES),
  severity: z.number().int().min(1).max(5),
  summary: z.string().trim().min(1).max(120),
});
export type PhotoReading = z.infer<typeof photoReadingSchema>;

// Job 2: draft the complaint (F6)

export const complaintLetterJsonSchema = {
  type: "object",
  properties: {
    subject: { type: "string", maxLength: 140 },
    body: { type: "string", maxLength: 1600 },
  },
  required: ["subject", "body"],
} as const;

export const complaintLetterSchema = z.object({
  subject: z.string().trim().min(1).max(140),
  body: z.string().trim().min(1).max(1600),
});
export type ComplaintLetter = z.infer<typeof complaintLetterSchema>;

// Job 3: verify the fix (F7)

export const CONFIDENCES = ["low", "medium", "high"] as const;

export const fixVerdictJsonSchema = {
  type: "object",
  properties: {
    same_location: { type: "boolean" },
    issue_resolved: { type: "boolean" },
    confidence: { enum: [...CONFIDENCES] },
    reason: { type: "string", maxLength: 160 },
  },
  required: ["same_location", "issue_resolved", "confidence", "reason"],
} as const;

export const fixVerdictSchema = z.object({
  same_location: z.boolean(),
  issue_resolved: z.boolean(),
  confidence: z.enum(CONFIDENCES),
  reason: z.string().trim().min(1).max(160),
});
export type FixVerdict = z.infer<typeof fixVerdictSchema>;
