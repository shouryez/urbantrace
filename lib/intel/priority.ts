// Dynamic priority (feature 9): a transparent score from safety, people affected, accessibility,
// recurrence, evidence, recent worsening, rain and waiting time. Upvotes alone never decide it;
// every factor is shown with its weight, so anyone can see why a case ranks where it does.
import type { Category } from "@/lib/ai/schemas";

export type PriorityInput = {
  category: Category;
  severity: number; // 1..5
  backerCount: number;
  accessibility: "none" | "partial" | "major";
  roadClass: string | null; // OSM highway type, e.g. primary, residential
  depthClass?: string | null;
  isRecurring: boolean;
  previousRepairs: number;
  evidenceConfidence: number; // 0..1
  recentMerges: number; // new backers in the last 72 hours
  rainLast3DaysMm: number;
  daysOpen: number;
  inIncident: boolean;
};

export const PRIORITY_FACTORS = [
  { key: "safety", label: "Safety risk", weight: 0.27 },
  { key: "people", label: "People affected", weight: 0.17 },
  { key: "accessibility", label: "Accessibility impact", weight: 0.12 },
  { key: "recurrence", label: "Recurrence", weight: 0.12 },
  { key: "evidence", label: "Evidence", weight: 0.1 },
  { key: "worsening", label: "Recent worsening", weight: 0.1 },
  { key: "rain", label: "Rain exposure", weight: 0.06 },
  { key: "waiting", label: "Waiting time", weight: 0.06 },
] as const;
export type PriorityKey = (typeof PRIORITY_FACTORS)[number]["key"];

export type PriorityResult = {
  score: number; // 0..100
  band: "critical" | "high" | "medium" | "low";
  factors: { key: PriorityKey; label: string; value: number; weight: number; contribution: number }[];
  reason: string;
};

/** How dangerous each kind of problem is to people, before severity. */
const HAZARD: Record<Category, number> = {
  power_hazard: 1,
  drainage: 0.9,
  pothole: 0.8,
  water_leak_sewage: 0.7,
  waterlogging: 0.7,
  footpath: 0.65,
  streetlight: 0.6,
  garbage: 0.4,
  other: 0.5,
};

/** Rough traffic weight of an OSM road class; unknown sits in the middle. */
const ROAD_USAGE: Record<string, number> = {
  motorway: 1, trunk: 1, primary: 0.95, secondary: 0.8, tertiary: 0.65, unclassified: 0.5,
  residential: 0.45, living_street: 0.4, service: 0.3, pedestrian: 0.7, footway: 0.65, cycleway: 0.4,
};

const RAIN_SENSITIVE = new Set<Category>(["waterlogging", "drainage", "pothole", "water_leak_sewage", "power_hazard"]);

const REASONS: Record<PriorityKey, string> = {
  safety: "safety hazard",
  people: "many people affected",
  accessibility: "blocks access for people on foot or in wheelchairs",
  recurrence: "repeated occurrence",
  evidence: "well evidenced",
  worsening: "getting worse",
  rain: "rain makes it worse",
  waiting: "waiting a long time",
};

export function computePriority(p: PriorityInput): PriorityResult {
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const depthBoost = p.category === "pothole" && p.depthClass === "deep" ? 0.12 : 0;
  const values: Record<PriorityKey, number> = {
    safety: clamp((p.severity / 5) * HAZARD[p.category] + depthBoost),
    people: clamp(0.6 * Math.min(1, Math.log2(1 + p.backerCount) / 5) + 0.4 * (ROAD_USAGE[p.roadClass ?? ""] ?? 0.5) + (p.inIncident ? 0.1 : 0)),
    accessibility: p.accessibility === "major" ? 1 : p.accessibility === "partial" ? 0.55 : 0,
    recurrence: p.isRecurring ? clamp(0.6 + 0.15 * p.previousRepairs) : 0,
    evidence: clamp(p.evidenceConfidence),
    worsening: clamp(p.recentMerges / 5),
    rain: RAIN_SENSITIVE.has(p.category) ? clamp(p.rainLast3DaysMm / 30) : 0,
    waiting: clamp(p.daysOpen / 45),
  };
  const factors = PRIORITY_FACTORS.map((f) => ({
    key: f.key,
    label: f.label,
    value: values[f.key],
    weight: f.weight,
    contribution: values[f.key] * f.weight,
  }));
  const score = Math.round(100 * factors.reduce((s, f) => s + f.contribution, 0));
  const top = [...factors].sort((a, b) => b.contribution - a.contribution).filter((f) => f.value >= 0.35).slice(0, 2);
  const reason = top.length ? top.map((f) => REASONS[f.key]).join(" + ").replace(/^./, (c) => c.toUpperCase()) : "Low overall risk";
  const band = score >= 70 ? "critical" : score >= 50 ? "high" : score >= 30 ? "medium" : "low";
  return { score, band, factors, reason };
}
