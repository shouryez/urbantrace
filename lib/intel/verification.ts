// Proof of fix (feature 4): the model is one witness, not the judge. Location, road segment,
// scene similarity, photo timestamp and the model's own reading are checked separately and
// combined into a score and an outcome: verified, partially resolved or not verified.

export type CheckState = "pass" | "fail" | "warn";
export type Check = { key: string; label: string; state: CheckState; detail: string };

export type VerificationInput = {
  distanceM: number;
  maxDistanceM: number;
  sameSegment: boolean | null; // null when either point has no segment
  modelSameLocation: boolean;
  modelSameRoad: boolean;
  sceneSimilarity: number | null; // 0..1 from the image comparison
  modelResolved: boolean;
  modelConfidence: "low" | "medium" | "high";
  residualIssues: string[];
  photoTakenAt: Date | null; // EXIF DateTimeOriginal, when the phone wrote one
  issueCreatedAt: Date;
  now?: Date;
};

export type VerificationResult = {
  checks: Check[];
  score: number; // 0..100
  outcome: "verified" | "partial" | "failed";
  headline: string;
};

const W = { location: 25, segment: 10, scene: 20, resolved: 30, timestamp: 15 };

export function scoreVerification(v: VerificationInput): VerificationResult {
  const now = v.now ?? new Date();
  const checks: Check[] = [];
  let score = 0;

  const locOk = v.distanceM <= v.maxDistanceM;
  checks.push({ key: "location", label: "Location match", state: locOk ? "pass" : "fail", detail: `${Math.round(v.distanceM)} m from the issue (limit ${v.maxDistanceM} m)` });
  if (locOk) score += W.location * (1 - (v.distanceM / v.maxDistanceM) * 0.3);

  const segOk = v.sameSegment ?? v.modelSameRoad;
  checks.push({ key: "segment", label: "Road segment match", state: segOk ? "pass" : "warn", detail: v.sameSegment === null ? (v.modelSameRoad ? "Model sees the same road" : "Could not confirm the road") : v.sameSegment ? "Same road segment" : "A different segment of the road" });
  if (segOk) score += W.segment;

  const sim = v.sceneSimilarity;
  const sceneOk = v.modelSameLocation && (sim === null || sim >= 0.35);
  checks.push({ key: "scene", label: "Same scene", state: sceneOk ? "pass" : v.modelSameLocation ? "warn" : "fail", detail: `${v.modelSameLocation ? "Model recognises the place" : "Model does not recognise the place"}${sim === null ? "" : `, layout similarity ${Math.round(sim * 100)}%`}` });
  if (sceneOk) score += W.scene * (sim === null ? 0.85 : Math.min(1, 0.6 + sim * 0.5));

  const conf = v.modelConfidence === "high" ? 1 : v.modelConfidence === "medium" ? 0.8 : 0.45;
  checks.push({ key: "resolved", label: "Issue disappeared", state: v.modelResolved ? (v.modelConfidence === "low" ? "warn" : "pass") : "fail", detail: v.modelResolved ? `Fixed, ${v.modelConfidence} confidence` : "The problem is still visible" });
  if (v.modelResolved) score += W.resolved * conf;

  let tsState: CheckState = "warn";
  let tsDetail = "The photo carries no capture time";
  if (v.photoTakenAt) {
    const after = v.photoTakenAt.getTime() >= v.issueCreatedAt.getTime() - 60_000;
    const recent = now.getTime() - v.photoTakenAt.getTime() <= 7 * 86_400_000 && v.photoTakenAt.getTime() <= now.getTime() + 3_600_000;
    tsState = after && recent ? "pass" : "fail";
    tsDetail = after ? (recent ? `Taken ${v.photoTakenAt.toISOString().slice(0, 16).replace("T", " ")} UTC` : "Taken more than a week ago") : "Taken before the issue was reported";
  }
  checks.push({ key: "timestamp", label: "Image timestamp", state: tsState, detail: tsDetail });
  score += tsState === "pass" ? W.timestamp : tsState === "warn" ? W.timestamp / 2 : 0;

  if (v.residualIssues.length) {
    checks.push({ key: "residual", label: "Remaining problems", state: "warn", detail: v.residualIssues.join("; ") });
  }

  score = Math.round(Math.max(0, Math.min(100, score)));
  const hardFail = !locOk || !v.modelResolved || tsState === "fail" || (!v.modelSameLocation && (sim ?? 0) < 0.35);
  const outcome: VerificationResult["outcome"] = hardFail
    ? "failed"
    : v.residualIssues.length || score < 75 || v.modelConfidence === "low"
      ? "partial"
      : "verified";
  const headline = outcome === "verified" ? "Verified fixed" : outcome === "partial" ? "Partially resolved" : "Not verified yet";
  return { checks, score, outcome, headline };
}
