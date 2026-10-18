// Civic time machine (feature 6), recurrence (7) and repair history (19) for one place.
// Turns the issues and fixes around a point into a month by month story and finds the cycle
// "problem appears → repaired → returns", how long repairs last, and whether rain sets it off.
import type { Category, Status } from "@/lib/ai/schemas";
import { CATEGORY_LABELS } from "@/lib/ai/schemas";

export type HistoryIssue = {
  id: number;
  category: Category;
  severity: number;
  status: Status;
  createdAt: string;
  verifiedAt: string | null;
  recurrenceOf: number | null;
};

export type MonthState = "normal" | "minor" | "problem" | "repaired";

export type TimelineMonth = {
  month: string; // YYYY-MM
  state: MonthState;
  events: { kind: "appeared" | "repaired" | "returned"; issueId: number; category: Category; day: string }[];
  rainMm: number | null;
};

export type Recurrence = { issueId: number; previousId: number; category: Category; repairedOn: string; returnedOn: string; lastedDays: number };

export type TimelineResult = {
  months: TimelineMonth[];
  recurrences: Recurrence[];
  repairs: number;
  repairsByYear: Record<string, number>;
  medianRepairLastedDays: number | null;
  rainLinked: boolean;
  pattern: string;
  categories: Category[];
};

const monthKey = (iso: string) => iso.slice(0, 7);

function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number) as [number, number];
  const [ty, tm] = to.split("-").map(Number) as [number, number];
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

export function buildTimeline(
  issues: HistoryIssue[],
  opts: { now?: Date; rainByDay?: Map<string, number>; heavyRainMm?: number } = {},
): TimelineResult {
  const now = opts.now ?? new Date();
  const heavy = opts.heavyRainMm ?? 15;
  const sorted = [...issues].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const categories = [...new Set(sorted.map((i) => i.category))];
  if (!sorted.length) {
    return { months: [], recurrences: [], repairs: 0, repairsByYear: {}, medianRepairLastedDays: null, rainLinked: false, pattern: "No reports here yet.", categories };
  }

  // A new issue of the same kind after a verified one is a recurrence, linked or not.
  const recurrences: Recurrence[] = [];
  for (const issue of sorted) {
    const previous = sorted
      .filter((p) => p.category === issue.category && p.verifiedAt && p.verifiedAt < issue.createdAt)
      .sort((a, b) => b.verifiedAt!.localeCompare(a.verifiedAt!))[0];
    if (previous && (issue.recurrenceOf === previous.id || issue.recurrenceOf === null)) {
      recurrences.push({
        issueId: issue.id,
        previousId: previous.id,
        category: issue.category,
        repairedOn: previous.verifiedAt!.slice(0, 10),
        returnedOn: issue.createdAt.slice(0, 10),
        lastedDays: Math.round((new Date(issue.createdAt).getTime() - new Date(previous.verifiedAt!).getTime()) / 86_400_000),
      });
    }
  }
  const returnedIds = new Set(recurrences.map((r) => r.issueId));

  const keys = monthsBetween(monthKey(sorted[0]!.createdAt), monthKey(now.toISOString()));
  const rainMonth = new Map<string, number>();
  for (const [day, mm] of opts.rainByDay ?? []) rainMonth.set(day.slice(0, 7), (rainMonth.get(day.slice(0, 7)) ?? 0) + mm);

  const months: TimelineMonth[] = keys.map((month) => {
    const events: TimelineMonth["events"] = [];
    for (const i of sorted) {
      if (monthKey(i.createdAt) === month) events.push({ kind: returnedIds.has(i.id) ? "returned" : "appeared", issueId: i.id, category: i.category, day: i.createdAt.slice(0, 10) });
      if (i.verifiedAt && monthKey(i.verifiedAt) === month) events.push({ kind: "repaired", issueId: i.id, category: i.category, day: i.verifiedAt.slice(0, 10) });
    }
    const endOfMonth = `${month}-31T23:59:59Z`;
    const active = sorted.filter((i) => i.createdAt <= endOfMonth && (!i.verifiedAt || i.verifiedAt > endOfMonth));
    const worst = Math.max(0, ...active.map((i) => i.severity));
    const repairedThisMonth = events.some((e) => e.kind === "repaired");
    const state: MonthState = worst >= 3 ? "problem" : worst > 0 ? "minor" : repairedThisMonth ? "repaired" : "normal";
    return { month, state, events, rainMm: opts.rainByDay ? Math.round(rainMonth.get(month) ?? 0) : null };
  });

  const repairs = sorted.filter((i) => i.verifiedAt);
  const repairsByYear: Record<string, number> = {};
  for (const r of repairs) repairsByYear[r.verifiedAt!.slice(0, 4)] = (repairsByYear[r.verifiedAt!.slice(0, 4)] ?? 0) + 1;
  const lasted = recurrences.map((r) => r.lastedDays).sort((a, b) => a - b);
  const medianRepairLastedDays = lasted.length ? lasted[Math.floor(lasted.length / 2)]! : null;

  // Rain linked: most returns or new problems started within a week after a heavy rain day.
  let rainLinked = false;
  if (opts.rainByDay && sorted.length >= 2) {
    const heavyDays = [...opts.rainByDay].filter(([, mm]) => mm >= heavy).map(([d]) => new Date(d).getTime());
    const starts = sorted.map((i) => new Date(i.createdAt).getTime());
    const afterRain = starts.filter((t) => heavyDays.some((h) => t >= h && t - h <= 7 * 86_400_000)).length;
    rainLinked = heavyDays.length > 0 && afterRain / starts.length >= 0.5;
  }

  const main = CATEGORY_LABELS[categories[0]!].toLowerCase();
  let pattern: string;
  if (recurrences.length >= 2) {
    pattern = `This place shows repeated ${main} problems: it has come back ${recurrences.length} times after repair${medianRepairLastedDays !== null ? `, and repairs lasted about ${medianRepairLastedDays} days` : ""}.`;
  } else if (recurrences.length === 1) {
    pattern = `The ${main} came back ${recurrences[0]!.lastedDays} days after it was repaired.`;
  } else if (repairs.length) {
    pattern = `Repaired ${repairs.length} time${repairs.length > 1 ? "s" : ""}; nothing has come back yet.`;
  } else {
    pattern = `Reported ${sorted.length} time${sorted.length > 1 ? "s" : ""}; no verified repair yet.`;
  }
  if (rainLinked) pattern += " Problems tend to start within a week of heavy rain.";

  return { months, recurrences, repairs: repairs.length, repairsByYear, medianRepairLastedDays, rainLinked, pattern, categories };
}
