import type { FixVerdict } from "@/lib/ai/schemas";
import type { Check } from "@/lib/intel/verification";

/** The after photo must be taken within this distance of the issue (F7). */
export const MAX_VERIFY_DISTANCE_M = 50;

/**
 * Pass rule (F7): the after photo's GPS is within 50 m of the issue, and the model says
 * same_location, issue_resolved and medium or high confidence. The GPS check is plain code,
 * so the model alone cannot close an issue.
 */
export function passesVerification(distanceM: number, verdict: FixVerdict): boolean {
  return (
    distanceM <= MAX_VERIFY_DISTANCE_M &&
    verdict.same_location &&
    verdict.issue_resolved &&
    (verdict.confidence === "medium" || verdict.confidence === "high")
  );
}

/** Reply of POST /api/issues/[id]/verify. */
export type VerifyResult = {
  passed: boolean;
  distanceM: number;
  reason: string;
  sameLocation: boolean;
  issueResolved: boolean;
  confidence: "low" | "medium" | "high";
  /** Feature 4: every check, the combined score and the outcome. */
  checks: Check[];
  score: number;
  outcome: "verified" | "partial" | "failed";
  headline: string;
  residualIssues: string[];
};
