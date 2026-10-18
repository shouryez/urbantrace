// Crowd truth (feature 5): combines the model's reading, each citizen's evidence, independent
// reports and history into a confidence per dimension. Agreement raises confidence, disagreement
// lowers it; more independent reports and richer media (video over photo over voice) count more.
import { centroid, haversineM, type Point } from "./geo";

export type EvidenceReport = Point & {
  deviceId: string;
  aiSeverity: number | null;
  userSeverity: number | null;
  media: "video" | "photo" | "voice";
  gpsAccuracyM: number | null;
  durationClaimDays: number | null;
  createdAt: string;
};

export type Dimension = { level: "very high" | "high" | "medium" | "low"; confidence: number; detail: string };

export type EvidenceResult = {
  overall: number; // 0..1
  severity: Dimension & { estimate: number };
  location: Dimension;
  recurrence: Dimension;
  duration: Dimension & { estimateDays: number };
  cause: Dimension;
  independentReports: number;
  media: { video: number; photo: number; voice: number };
};

const level = (c: number): Dimension["level"] => (c >= 0.85 ? "very high" : c >= 0.65 ? "high" : c >= 0.4 ? "medium" : "low");
const MEDIA_WEIGHT = { video: 1.3, photo: 1, voice: 0.6 } as const;

function weightedMedian(xs: { v: number; w: number }[]): number {
  const s = [...xs].sort((a, b) => a.v - b.v);
  const half = s.reduce((t, x) => t + x.w, 0) / 2;
  let acc = 0;
  for (const x of s) {
    acc += x.w;
    if (acc >= half) return x.v;
  }
  return s.at(-1)?.v ?? 3;
}

export function assessEvidence(
  reports: EvidenceReport[],
  ctx: { recurring: boolean; previousRepairs: number; causeConfidence: number | null; causeLabel: string | null; now?: number },
): EvidenceResult {
  const now = ctx.now ?? Date.now();
  const devices = new Set(reports.map((r) => r.deviceId)).size;
  const n = Math.max(1, devices);
  const media = { video: 0, photo: 0, voice: 0 };
  reports.forEach((r) => media[r.media]++);
  const mediaWeight = reports.reduce((s, r) => s + MEDIA_WEIGHT[r.media], 0) / Math.max(1, reports.length);

  // Severity: the model's reading and people's own opinions, weighted by media; agreement = low spread.
  const sev = reports.flatMap((r) => [
    ...(r.aiSeverity ? [{ v: r.aiSeverity, w: MEDIA_WEIGHT[r.media] }] : []),
    ...(r.userSeverity ? [{ v: r.userSeverity, w: 1.2 * MEDIA_WEIGHT[r.media] }] : []),
  ]);
  const sevEstimate = sev.length ? weightedMedian(sev) : 3;
  const mean = sev.length ? sev.reduce((s, x) => s + x.v, 0) / sev.length : 3;
  const sd = sev.length > 1 ? Math.sqrt(sev.reduce((s, x) => s + (x.v - mean) ** 2, 0) / (sev.length - 1)) : 1;
  const sevConf = Math.min(0.97, (1 - Math.min(1, sd / 2)) * (1 - Math.exp(-sev.length / 3)) * Math.min(1.1, mediaWeight));

  // Location: how tightly the reports agree on the spot, and how good the GPS fixes were.
  const c = centroid(reports);
  const spread = reports.length > 1 ? reports.reduce((s, r) => s + haversineM(c, r), 0) / reports.length : 25;
  const acc = reports.filter((r) => r.gpsAccuracyM).map((r) => r.gpsAccuracyM!);
  const avgAcc = acc.length ? acc.reduce((s, x) => s + x, 0) / acc.length : 30;
  const locConf = Math.min(0.98, Math.exp(-spread / 60) * 0.6 + Math.exp(-avgAcc / 40) * 0.25 + (1 - Math.exp(-n / 2)) * 0.25);

  // Recurrence: from repair history.
  const recConf = ctx.recurring ? Math.min(0.95, 0.75 + 0.07 * ctx.previousRepairs) : 0.25;

  // Duration: how long it has existed, from first report and people's own claims ("3 months").
  const firstAt = Math.min(...reports.map((r) => new Date(r.createdAt).getTime()), now);
  const ageDays = Math.max(0, (now - firstAt) / 86_400_000);
  const claims = reports.map((r) => r.durationClaimDays).filter((d): d is number => d !== null && d > 0);
  const claimMedian = claims.length ? [...claims].sort((a, b) => a - b)[Math.floor(claims.length / 2)]! : null;
  const estimateDays = Math.round(Math.max(ageDays, claimMedian ?? 0));
  const claimAgreement = claims.length > 1 ? 1 - Math.min(1, (Math.max(...claims) - Math.min(...claims)) / Math.max(...claims)) : 0.5;
  const durConf = Math.min(0.9, (claims.length ? 0.35 + 0.35 * claimAgreement : 0.25) + Math.min(0.3, ageDays / 60));

  const causeConf = ctx.causeConfidence ?? 0.3;

  const dims = {
    severity: { level: level(sevConf), confidence: sevConf, detail: `${sev.length} assessments, spread ${sd.toFixed(1)}`, estimate: sevEstimate },
    location: { level: level(locConf), confidence: locConf, detail: `${reports.length} reports within ${Math.round(spread)} m on average` },
    recurrence: {
      level: level(recConf),
      confidence: recConf,
      detail: ctx.recurring ? `returned after ${ctx.previousRepairs + 1} repair${ctx.previousRepairs ? "s" : ""}` : "no repair history here",
    },
    duration: {
      level: level(durConf),
      confidence: durConf,
      detail: claims.length ? `${claims.length} people say about ${claimMedian} days` : `first reported ${Math.round(ageDays)} days ago`,
      estimateDays,
    },
    cause: { level: level(causeConf), confidence: causeConf, detail: ctx.causeLabel ? `likely ${ctx.causeLabel.toLowerCase()}` : "not yet linked to a cause" },
  };
  const overall = Math.min(0.98, 0.3 * sevConf + 0.3 * locConf + 0.15 * durConf + 0.15 * causeConf + 0.1 * (1 - Math.exp(-n / 3)));
  return { overall, ...dims, independentReports: devices, media };
}

/** "It has been here for 3 months" → 90. Understands days, weeks, months and years in English. */
export function parseDurationClaim(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = text.toLowerCase().match(/(\d+|a|an|one|two|three|four|five|six|several|few)\s*(day|week|month|year)s?/);
  if (!m) return null;
  const words: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, few: 3, several: 4 };
  const n = Number(m[1]) || words[m[1]!] || 1;
  const unit = { day: 1, week: 7, month: 30, year: 365 }[m[2] as "day" | "week" | "month" | "year"];
  return n * unit;
}
