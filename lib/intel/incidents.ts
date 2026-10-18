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
  /** The locality from the address ("HSR Layout"), for a readable title. */
  place?: string | null;
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
  /** 0..1, the weighted sum of `factors`. */
  confidence: number;
  /** Why the reports are taken to be one incident, each factor 0..1 with its weight and plain words. */
  factors: IncidentFactor[];
  reasons: string[];
};

export type IncidentFactor = { key: "size" | "density" | "time" | "cause" | "coverage"; label: string; value: number; weight: number; detail: string };

const DRAINAGE_FAMILY = new Set<Category>(["waterlogging", "drainage", "water_leak_sewage"]);

/** Neighbourhood radius in metres for a pair of problems. */
function spaceEps(a: Category, b: Category): number {
  if (DRAINAGE_FAMILY.has(a) && DRAINAGE_FAMILY.has(b)) return 650;
  if (DRAINAGE_FAMILY.has(a) || DRAINAGE_FAMILY.has(b)) return 450;
  return 300;
}

const DAY = 86_400_000;
/** Drainage problems come and go with rain, so they must be close in time; road damage builds up slowly. */
function timeEps(a: Category, b: Category): number {
  if (DRAINAGE_FAMILY.has(a) && DRAINAGE_FAMILY.has(b)) return 10 * DAY;
  return 30 * DAY;
}
const MIN_RELATEDNESS = 0.3;

/**
 * Quality gates: an incident needs at least `minIssues` distinct problems (one problem with many backers is
 * already a single case), `minReports` reports, and one cause that is at least 45% likely and explains at
 * least 60% of the reports. Otherwise the problems are a coincidence of place, not one incident.
 */
export function detectIncidents(items: ClusterInput[], opts: { recentRainMm?: number; minReports?: number; minIssues?: number } = {}): DetectedIncident[] {
  const minReports = opts.minReports ?? 4;
  const minIssues = opts.minIssues ?? 3;
  const open = items.filter((i) => i.status !== "verified");
  const time = (i: ClusterInput) => new Date(i.createdAt).getTime();

  const neighbours = (i: number) =>
    open
      .map((_, j) => j)
      .filter((j) => {
        if (j === i) return false;
        const a = open[i]!, b = open[j]!;
        return (
          Math.abs(time(a) - time(b)) <= timeEps(a.category, b.category) &&
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
    if (members.length < minIssues || reportCount < minReports) continue;

    const categories: Partial<Record<Category, number>> = {};
    for (const m of members) categories[m.category] = (categories[m.category] ?? 0) + m.backerCount;
    const center = centroid(members.map((m) => ({ ...m, weight: m.backerCount })));
    const radiusM = Math.max(60, ...members.map((m) => haversineM(center, m)));
    const times = members.map(time).sort((a, b) => a - b);
    const spanH = (times.at(-1)! - times[0]!) / 3_600_000;
    const root = inferRootCause(categories, { recentRainMm: opts.recentRainMm });
    if (root.confidence < 0.45 || root.coverage < 0.6) continue;

    const areaKm2 = Math.PI * (radiusM / 1000) ** 2;
    const perKm2 = reportCount / Math.max(0.01, areaKm2);
    const factors: IncidentFactor[] = [
      { key: "size", label: "Enough reports", value: 1 - Math.exp(-reportCount / 8), weight: 0.25, detail: `${reportCount} reports about ${members.length} problems` },
      { key: "density", label: "Packed close together", value: Math.min(1, perKm2 / 40), weight: 0.15, detail: `${Math.round(perKm2)} reports per km² within ${Math.round(radiusM)} m` },
      {
        key: "time",
        label: "Close in time",
        value: spanH <= 24 ? 1 : spanH <= 24 * 7 ? 0.75 : spanH <= 24 * 21 ? 0.5 : 0.3,
        weight: 0.15,
        detail: spanH < 48 ? `all within ${Math.max(1, Math.round(spanH))} hours` : `over ${Math.round(spanH / 24)} days`,
      },
      { key: "cause", label: "One cause fits", value: root.confidence, weight: 0.3, detail: `${root.label}: ${Math.round(root.confidence * 100)}% likely among ${root.ranked.length} causes` },
      { key: "coverage", label: "Cause explains the problems", value: root.coverage, weight: 0.15, detail: `accounts for ${Math.round(root.coverage * 100)}% of the reports` },
    ];
    const confidence = Math.min(0.97, factors.reduce((s, f) => s + f.value * f.weight, 0));

    const reasons = [
      `${reportCount} reports within ${Math.round(radiusM)} m`,
      spanH < 48 ? `within ${Math.max(1, Math.round(spanH))} hours` : `over ${Math.round(spanH / 24)} days`,
      `likely common cause: ${root.label.toLowerCase()}`,
    ];
    const first = members.reduce((a, b) => (a.id < b.id ? a : b));
    out.push({
      signature: `cluster:${first.id}`,
      title: `${CAUSE_TITLES[root.cause] ?? NODE_LABELS[root.cause]}${commonPlace(members) ? ` in ${commonPlace(members)}` : ""}`,
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
      factors,
      reasons,
    });
  }
  return out.sort((a, b) => b.reportCount - a.reportCount);
}

/** The locality most members share, if any. */
function commonPlace(members: ClusterInput[]): string | null {
  const counts = new Map<string, number>();
  for (const m of members) if (m.place) counts.set(m.place, (counts.get(m.place) ?? 0) + 1);
  const [best] = [...counts].sort((a, b) => b[1] - a[1]);
  return best && best[1] >= Math.ceil(members.length / 2) ? best[0] : null;
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
  /** Reports the area normally gets in a window this long (the Poisson rate). */
  baseline: number;
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
      baseline: Math.round(lambda * 100) / 100,
      firstAt: new Date(times[0]!).toISOString(),
      lastAt: new Date(times.at(-1)!).toISOString(),
    });
  }
  return alerts;
}
