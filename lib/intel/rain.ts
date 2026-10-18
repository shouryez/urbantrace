// Weather and civic intelligence (feature 15): does rain drive reports here?
// Compares reports in the days after heavy rain with the days before, and the lag-1 correlation
// between daily rainfall and the next day's reports. Pure functions; the data comes from lib/weather.ts.

export type RainImpact = {
  heavyRainDays: number;
  before: number; // reports in the 3 days before heavy rain (summed over events)
  after: number; // reports in the 3 days after
  ratio: number | null;
  correlation: number | null; // Pearson, rain today vs reports tomorrow
  pattern: "strong" | "some" | "none" | "not enough data";
  summary: string;
};

const DAY = 86_400_000;
const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);

export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 5) return null;
  const mx = xs.slice(0, n).reduce((s, x) => s + x, 0) / n;
  const my = ys.slice(0, n).reduce((s, y) => s + y, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - mx) * (ys[i]! - my);
    dx += (xs[i]! - mx) ** 2;
    dy += (ys[i]! - my) ** 2;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : null;
}

export function rainImpact(reportDates: string[], rainByDay: Map<string, number>, opts: { heavyMm?: number; label?: string } = {}): RainImpact {
  const heavyMm = opts.heavyMm ?? 15;
  const label = opts.label ?? "reports";
  const counts = new Map<string, number>();
  for (const d of reportDates) counts.set(d.slice(0, 10), (counts.get(d.slice(0, 10)) ?? 0) + 1);
  const days = [...rainByDay.keys()].sort();
  if (days.length < 10 || reportDates.length < 4) {
    return { heavyRainDays: 0, before: 0, after: 0, ratio: null, correlation: null, pattern: "not enough data", summary: "Not enough rain or report history yet." };
  }

  const heavy = days.filter((d) => (rainByDay.get(d) ?? 0) >= heavyMm);
  let before = 0, after = 0;
  for (const d of heavy) {
    const t = new Date(d).getTime();
    for (let k = 1; k <= 3; k++) {
      before += counts.get(dayKey(t - k * DAY)) ?? 0;
      after += counts.get(dayKey(t + (k - 1) * DAY)) ?? 0;
    }
  }
  const ratio = heavy.length ? (after + 0.5) / (before + 0.5) : null;
  const rain = days.slice(0, -1).map((d) => rainByDay.get(d) ?? 0);
  const next = days.slice(1).map((d) => counts.get(d) ?? 0);
  const correlation = pearson(rain, next);

  const strong = ratio !== null && ratio >= 2.5 && after >= 5;
  const some = (ratio !== null && ratio >= 1.5 && after >= 3) || (correlation !== null && correlation >= 0.3);
  const pattern = strong ? "strong" : some ? "some" : "none";
  const summary =
    pattern === "none"
      ? `No clear link between rain and ${label} here.`
      : `${heavy.length} heavy rain day${heavy.length === 1 ? "" : "s"}: ${before} ${label} in the 3 days before, ${after} in the 3 days after. ${pattern === "strong" ? "Strong" : "Some"} rainfall-related pattern.`;
  return { heavyRainDays: heavy.length, before, after, ratio: ratio === null ? null : Math.round(ratio * 10) / 10, correlation: correlation === null ? null : Math.round(correlation * 100) / 100, pattern, summary };
}
