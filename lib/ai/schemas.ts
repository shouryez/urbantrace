import { z } from "zod";

// Mirrors the issue_category and issue_status enums (0001_schema.sql; drainage and footpath from 0007).
export const CATEGORIES = [
  "pothole",
  "garbage",
  "streetlight",
  "waterlogging",
  "drainage",
  "footpath",
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
  drainage: "Open or blocked drain",
  footpath: "Footpath damage",
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
    same_road: { type: "boolean" },
    residual_issues: { type: "array", items: { type: "string", maxLength: 80 }, maxItems: 3 },
  },
  required: ["same_location", "issue_resolved", "confidence", "reason", "same_road", "residual_issues"],
} as const;

export const fixVerdictSchema = z.object({
  same_location: z.boolean(),
  issue_resolved: z.boolean(),
  confidence: z.enum(CONFIDENCES),
  reason: z.string().trim().min(1).max(160),
  /** Same road or street, even if the exact spot is unclear (feature 4). */
  same_road: z.boolean().default(true),
  /** Problems still visible after the repair, e.g. "drain still blocked". */
  residual_issues: z.array(z.string().trim().min(1).max(80)).max(3).default([]),
});
export type FixVerdict = z.infer<typeof fixVerdictSchema>;

// Case extraction (features 1, 11, 12): one or more photos or video frames and/or a voice note
// become a structured civic case with every problem found, its evidence frames and its risk.

export const ACCESSIBILITY = ["none", "partial", "major"] as const;
export type Accessibility = (typeof ACCESSIBILITY)[number];

export const caseIssueJsonSchema = {
  type: "object",
  properties: {
    category: { enum: [...CATEGORIES] },
    severity: { type: "integer", minimum: 1, maximum: 5 },
    summary: { type: "string", maxLength: 120 },
    frames: { type: "array", items: { type: "integer", minimum: 0, maximum: 9 }, maxItems: 4 },
  },
  required: ["category", "severity", "summary", "frames"],
} as const;

export const caseReadingJsonSchema = {
  type: "object",
  properties: {
    is_civic_issue: { type: "boolean" },
    issues: { type: "array", items: caseIssueJsonSchema, minItems: 1, maxItems: 5 },
    accessibility: { enum: [...ACCESSIBILITY] },
    hazards: { type: "array", items: { type: "string", maxLength: 60 }, maxItems: 3 },
    location_hint: { type: "string", maxLength: 100 },
    duration_claim: { type: "string", maxLength: 40 },
    summary_local: { type: "string", maxLength: 200 },
  },
  required: ["is_civic_issue", "issues", "accessibility", "hazards", "location_hint", "duration_claim", "summary_local"],
} as const;

export const caseIssueSchema = z.object({
  category: z.enum(CATEGORIES),
  severity: z.number().int().min(1).max(5),
  summary: z.string().trim().min(1).max(120),
  frames: z.array(z.number().int().min(0).max(9)).max(4).default([]),
});
export type CaseIssue = z.infer<typeof caseIssueSchema>;

export const caseReadingSchema = z.object({
  is_civic_issue: z.boolean(),
  issues: z.array(caseIssueSchema).min(1).max(5),
  accessibility: z.enum(ACCESSIBILITY),
  hazards: z.array(z.string().trim().min(1).max(60)).max(3).default([]),
  location_hint: z.string().trim().max(100).default(""),
  duration_claim: z.string().trim().max(40).default(""),
  summary_local: z.string().trim().max(200).default(""),
});
export type CaseReading = z.infer<typeof caseReadingSchema>;

/** The primary problem of a case in the old single-reading shape, for code that needs one. */
export function primaryReading(c: CaseReading): PhotoReading {
  const p = c.issues[0]!;
  return { is_civic_issue: c.is_civic_issue, category: p.category, severity: p.severity, summary: p.summary };
}

// Case file (feature 17): the complaint compiler's structured case and letter.

export const caseFileJsonSchema = {
  type: "object",
  properties: {
    subject: { type: "string", maxLength: 140 },
    observed_condition: { type: "string", maxLength: 400 },
    safety_implications: { type: "string", maxLength: 300 },
    supporting_evidence: { type: "array", items: { type: "string", maxLength: 120 }, maxItems: 6 },
    recommended_inspection: { type: "string", maxLength: 300 },
    research_summary: { type: "string", maxLength: 600 },
    key_findings: { type: "array", items: { type: "string", maxLength: 160 }, maxItems: 6 },
    body: { type: "string", maxLength: 1600 },
  },
  required: ["subject", "observed_condition", "safety_implications", "supporting_evidence", "recommended_inspection", "research_summary", "key_findings", "body"],
} as const;

export const caseFileSchema = z.object({
  subject: z.string().trim().min(1).max(140),
  observed_condition: z.string().trim().min(1).max(400),
  safety_implications: z.string().trim().min(1).max(300),
  supporting_evidence: z.array(z.string().trim().min(1).max(120)).max(6),
  recommended_inspection: z.string().trim().min(1).max(300),
  // Older case files were compiled before follow-up research existed.
  research_summary: z.string().trim().max(600).optional(),
  key_findings: z.array(z.string().trim().min(1).max(160)).max(6).optional(),
  body: z.string().trim().min(1).max(1600),
});
export type CaseFile = z.infer<typeof caseFileSchema>;

// Follow-up questions: after the model reads the evidence it asks what a photo cannot show.

export const FOLLOW_UP_KINDS = ["choice", "text"] as const;

export const followUpJsonSchema = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: {
        type: "object",
        properties: {
          id: { type: "string", maxLength: 24 },
          question: { type: "string", maxLength: 120 },
          kind: { enum: [...FOLLOW_UP_KINDS] },
          options: { type: "array", items: { type: "string", maxLength: 40 }, maxItems: 5 },
          why: { type: "string", maxLength: 100 },
        },
        required: ["id", "question", "kind", "options", "why"],
      },
    },
  },
  required: ["questions"],
} as const;

// Lenient on length: an over-long question is cut, not rejected, so a good reply is not thrown away.
const cut = (n: number) => z.string().trim().min(1).transform((s) => s.slice(0, n));
export const followUpQuestionSchema = z.object({
  id: cut(24),
  question: cut(160),
  kind: z.enum(FOLLOW_UP_KINDS),
  options: z.array(cut(48)).transform((o) => o.slice(0, 5)),
  why: z.string().trim().transform((s) => s.slice(0, 160)),
});
export const followUpSchema = z.object({ questions: z.array(followUpQuestionSchema).min(1).transform((q) => q.slice(0, 4)) });
export type FollowUpQuestion = z.infer<typeof followUpQuestionSchema>;

/** One answered question, as sent with the report and kept with it. */
export const followUpAnswerSchema = z.object({
  question: z.string().trim().min(1).max(120),
  answer: z.string().trim().min(1).max(300),
});
export type FollowUpAnswer = z.infer<typeof followUpAnswerSchema>;

/** The question every report gets first: the model cannot see how long a problem has been there. */
export const DURATION_QUESTION: FollowUpQuestion = {
  id: "duration",
  question: "How long has this been here?",
  kind: "choice",
  options: ["Just started", "A few days", "1 to 2 weeks", "About a month", "Several months", "Over a year"],
  why: "Older problems get a higher priority.",
};

/** Days for an answer to the duration question, for priority and crowd truth. */
export const DURATION_DAYS: Record<string, number> = {
  "Just started": 1,
  "A few days": 4,
  "1 to 2 weeks": 10,
  "About a month": 30,
  "Several months": 120,
  "Over a year": 400,
};

// Scenario (feature 14): "what happens if we don't fix this?" A model-generated scenario, not a prediction.

export const LEVELS = ["low", "medium", "high"] as const;

export const scenarioJsonSchema = {
  type: "object",
  properties: {
    chain: {
      type: "array",
      minItems: 3,
      maxItems: 6,
      items: { type: "object", properties: { effect: { type: "string", maxLength: 60 }, why: { type: "string", maxLength: 120 } }, required: ["effect", "why"] },
    },
    road_users: { enum: [...LEVELS] },
    accessibility: { enum: [...LEVELS] },
    recurrence: { enum: [...LEVELS] },
    summary: { type: "string", maxLength: 220 },
  },
  required: ["chain", "road_users", "accessibility", "recurrence", "summary"],
} as const;

export const scenarioSchema = z.object({
  chain: z.array(z.object({ effect: z.string().trim().min(1).max(60), why: z.string().trim().min(1).max(120) })).min(3).max(6),
  road_users: z.enum(LEVELS),
  accessibility: z.enum(LEVELS),
  recurrence: z.enum(LEVELS),
  summary: z.string().trim().min(1).max(220),
});
export type Scenario = z.infer<typeof scenarioSchema>;

// Explanations (features 2, 13): plain words for an incident's root cause or a map zone.

export const explanationJsonSchema = {
  type: "object",
  properties: { title: { type: "string", maxLength: 70 }, explanation: { type: "string", maxLength: 320 } },
  required: ["title", "explanation"],
} as const;

export const explanationSchema = z.object({
  title: z.string().trim().min(1).max(70),
  explanation: z.string().trim().min(1).max(320),
});
export type Explanation = z.infer<typeof explanationSchema>;
