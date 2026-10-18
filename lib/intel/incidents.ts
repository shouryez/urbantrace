// Civic incident detection (feature 3) and emergency alerts (feature 16).
//
// Clusters: a space-time DBSCAN over unresolved issues. Two issues are neighbours when they are
// close in space (the radius depends on the kind of problem: drainage spreads further than a
// pothole), close in time, and causally related in the civic graph. A cluster with enough reports
// becomes an incident, named after its inferred root cause.
//
// Alerts: a burst test. If the reports in a small area over the last 90 minutes are far more than
// that area's own baseline rate predicts (Poisson tail probability), the system raises an alert.
import type { Category, Status } from "@/lib/ai/schemas";
import { CAUSE_TITLES, inferRootCause, NODE_LABELS, relatedness, type RootCauseResult } from "./causal";
import { centroid, haversineM, type Point } from "./geo";

export type ClusterInput = Point & {
  id: number;
  category: Category;
  status: Status;
  severity: number;
  backerCount: number;
  createdAt: string;
};

export type DetectedIncident = {
  signature: string;
  title: string;
  issueIds: number[];
  center: Point;
  radiusM: number;
  reportCount: number;
  issueCount: number;
  categories: Partial<Record<Category, number>>;
  firstAt: string;
  lastAt: string;
  rootCause: RootCauseResult;
  /** 0..1: size, density, causal fit and how concentrated in time the reports are. */
  confidence: number;
  reasons: string[];
};

const DRAINAGE_FAMILY = new Set<Category>(["waterlogging", "drainage", "water_leak_sewage"]);

/** Neighbourhood radius in metres for a pair of problems. */
function spaceEps(a: Category, b: Category): number {
  if (DRAINAGE_FAMILY.has(a) && DRAINAGE_FAMILY.has(b)) return 650;
  if (DRAINAGE_FAMILY.has(a) || DRAINAGE_FAMILY.has(b)) return 450;
  return 300;
}

const DAY = 86_400_000;
const TIME_EPS_MS = 21 * DAY;
const MIN_RELATEDNESS = 0.3;

export function detectIncidents(items: ClusterInput[], opts: { recentRainMm?: number; minReports?: number } = {}): DetectedIncident[] {
  const minReports = opts.minReports ?? 4;
  const open = items.filter((i) => i.status !== "verified");
  const time = (i: ClusterInput) => new Date(i.createdAt).getTime();

  const neighbours = (i: number) =>
    open
      .map((_, j) => j)
      .filter((j) => {
        if (j === i) return false;
        const a = open[i]!, b = open[j]!;
        return (
          Math.abs(time(a) - time(b)) <= TIME_EPS_MS &&
          haversineM(a, b) <= spaceEps(a.category, b.category) &&
          relatedness(a.category, b.category) >= MIN_RELATEDNESS
        );
      });

  // DBSCAN with "core" defined by reports (backers), not issue count: one issue with 12 backers is dense.
  const label = new Array<number>(open.length).fill(-1);
  let cluster = 0;
  for (let i = 0; i < open.length; i++) {
    if (label[i] !== -1) continue;
    const seed = neighbours(i);
    const weight = open[i]!.backerCount + seed.reduce((s, j) => s + open[j]!.backerCount, 0);
    if (seed.length === 0 || weight < minReports) continue;
    label[i] = cluster;
    const queue = [...seed];
    while (queue.length) {
      const j = queue.shift()!;
      if (label[j] !== -1) continue;
      label[j] = cluster;
      const more = neighbours(j);
      if (more.length + 1 >= 2) queue.push(...more.filter((k) => label[k] === -1));
    }
    cluster++;
  }

  const out: DetectedIncident[] = [];
  for (let c = 0; c < cluster; c++) {
    const members = open.filter((_, i) => label[i] === c);
    const reportCount = members.reduce((s, m) => s + m.backerCount, 0);
    if (members.length < 2 || reportCount < minReports) continue;

    const categories: Partial<Record<Category, number>> = {};
    for (const m of members) categories[m.category] = (categories[m.category] ?? 0) + m.backerCount;
    const center = centroid(members.map((m) => ({ ...m, weight: m.backerCount })));
    const radiusM = Math.max(60, ...members.map((m) => haversineM(center, m)));
    const times = members.map(time).sort((a, b) => a - b);
    const spanH = (times.at(-1)! - times[0]!) / 3_600_000;
    const root = inferRootCause(categories, { recentRainMm: opts.recentRainMm });

    const size = 1 - Math.exp(-reportCount / 8);
    const density = Math.min(1, reportCount / Math.max(1, (Math.PI * (radiusM / 1000) ** 2) * 40));
    const burst = spanH <= 24 ? 1 : spanH <= 24 * 7 ? 0.7 : 0.45;
    const confidence = Math.min(0.97, 0.35 * size + 0.15 * density + 0.35 * root.confidence + 0.15 * burst);

    const reasons = [
      `${reportCount} reports within ${Math.round(radiusM)} m`,
      spanH < 48 ? `within ${Math.max(1, Math.round(spanH))} hours` : `over ${Math.round(spanH / 24)} days`,
      `likely common cause: ${root.label.toLowerCase()}`,
    ];
    const first = members.reduce((a, b) => (a.id < b.id ? a : b));
    out.push({
      signature: `cluster:${first.id}`,
      title: `${CAUSE_TITLES[root.cause] ?? NODE_LABELS[root.cause]}`,
      issueIds: members.map((m) => m.id),
      center,
      radiusM,
      reportCount,
      issueCount: members.length,
      categories,
      firstAt: new Date(times[0]!).toISOString(),
      lastAt: new Date(times.at(-1)!).toISOString(),
      rootCause: root,
      confidence,
      reasons,
    });
  }
  return out.sort((a, b) => b.reportCount - a.reportCount);
}

// ---------------------------------------------------------------------------------------------
// Alerts

export type ReportEvent = Point & { issueId: number; category: Category; at: string };

export type DetectedAlert = {
  signature: string;
  title: string;
  center: Point;
  radiusM: number;
  areaKm2: number;
  reports: number;
  locations: number;
  windowMinutes: number;
  issueIds: number[];
  categories: Partial<Record<Category, number>>;
  /** Probability of seeing this many reports by chance at the area's normal rate. */
  pValue: number;
  firstAt: string;
  lastAt: string;
};

/** P(X >= k) for X ~ Poisson(lambda). */
export function poissonTail(k: number, lambda: number): number {
  if (k <= 0) return 1;
  let term = Math.exp(-lambda);
  let cdf = term;
  for (let i = 1; i < k; i++) {
    term *= lambda / i;
    cdf += term;
  }
  return Math.max(0, 1 - cdf);
}

const ALERT_TITLES: Partial<Record<Category, string>> = {
  waterlogging: "Possible localised flooding",
  drainage: "Possible drainage overflow",
  water_leak_sewage: "Possible burst main or sewage overflow",
  power_hazard: "Possible electrical hazard spreading",
  streetlight: "Possible area power outage",
};

/**
 * Bursts in the last `windowMinutes`: at least `minReports` reports from `minLocations` places within
 * `radiusM`, and very unlikely at the area's baseline rate over the previous 30 days.
 */
export function detectAlerts(
  events: ReportEvent[],
  now = Date.now(),
  opts: { windowMinutes?: number; radiusM?: number; minReports?: number; minLocations?: number; maxP?: number } = {},
): DetectedAlert[] {
  const windowMs = (opts.windowMinutes ?? 90) * 60_000;
  const radiusM = opts.radiusM ?? 1000;
  const minReports = opts.minReports ?? 6;
  const minLocations = opts.minLocations ?? 4;
  const maxP = opts.maxP ?? 0.001;
  const t = (e: ReportEvent) => new Date(e.at).getTime();
  const recent = events.filter((e) => now - t(e) <= windowMs && t(e) <= now);
  const history = events.filter((e) => now - t(e) > windowMs && now - t(e) <= 30 * 86_400_000);

  const used = new Set<ReportEvent>();
  const alerts: DetectedAlert[] = [];
  for (const seed of recent) {
    if (used.has(seed)) continue;
    const group = recent.filter((e) => !used.has(e) && haversineM(seed, e) <= radiusM);
    const locations = new Set(group.map((e) => e.issueId)).size;
    if (group.length < minReports || locations < minLocations) continue;

    const center = centroid(group);
    const baselineCount = history.filter((e) => haversineM(center, e) <= radiusM).length;
    const windows = (30 * 86_400_000 - windowMs) / windowMs;
    const lambda = Math.max(0.05, baselineCount / windows);
    const pValue = poissonTail(group.length, lambda);
    if (pValue > maxP) continue;

    group.forEach((e) => used.add(e));
    const categories: Partial<Record<Category, number>> = {};
    for (const e of group) categories[e.category] = (categories[e.category] ?? 0) + 1;
    const top = (Object.entries(categories) as [Category, number][]).sort((a, b) => b[1] - a[1])[0]![0];
    const spread = Math.max(150, ...group.map((e) => haversineM(center, e)));
    const times = group.map(t).sort((a, b) => a - b);
    alerts.push({
      signature: `alert:${Math.min(...group.map((e) => e.issueId))}:${new Date(times[0]!).toISOString().slice(0, 13)}`,
      title: ALERT_TITLES[top] ?? "Possible emerging incident",
      center,
      radiusM: spread,
      areaKm2: Math.round(Math.PI * (spread / 1000) ** 2 * 10) / 10,
      reports: group.length,
      locations,
      windowMinutes: Math.max(1, Math.round((times.at(-1)! - times[0]!) / 60_000)),
      issueIds: [...new Set(group.map((e) => e.issueId))],
      categories,
      pValue,
      firstAt: new Date(times[0]!).toISOString(),
      lastAt: new Date(times.at(-1)!).toISOString(),
    });
  }
  return alerts;
}
