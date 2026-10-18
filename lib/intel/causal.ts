// The civic causal graph: which underlying problems tend to produce which visible ones.
// Used to group related reports into one incident, to name its likely root cause, and to explain it.
// Edge strengths are hand-set priors from how drainage, roads, waste and power networks fail; they
// are an analytical aid, not a diagnosis. Inference runs in code, so it is fast and explainable.
import type { Category } from "@/lib/ai/schemas";

/** Underlying causes that are not reported directly but explain what people see. */
export const LATENT_CAUSES = [
  "blocked_drain",
  "silt_buildup",
  "waste_collection_gap",
  "water_main_leak",
  "road_base_failure",
  "heavy_rainfall",
  "electrical_fault",
  "construction_damage",
] as const;
export type LatentCause = (typeof LATENT_CAUSES)[number];
export type CausalNode = Category | LatentCause;

export const NODE_LABELS: Record<CausalNode, string> = {
  pothole: "Potholes",
  garbage: "Garbage",
  streetlight: "Streetlight failure",
  waterlogging: "Waterlogging",
  water_leak_sewage: "Leak or sewage",
  power_hazard: "Power line hazard",
  drainage: "Open or blocked drain",
  footpath: "Footpath damage",
  other: "Other",
  blocked_drain: "Blocked drain",
  silt_buildup: "Silt build-up",
  waste_collection_gap: "Missed waste collection",
  water_main_leak: "Leaking water main",
  road_base_failure: "Road base failure",
  heavy_rainfall: "Heavy rainfall",
  electrical_fault: "Electrical fault",
  construction_damage: "Construction damage",
};

/** Short, plain names for a root cause in a title ("Drainage failure near …"). */
export const CAUSE_TITLES: Partial<Record<CausalNode, string>> = {
  blocked_drain: "Drainage failure",
  silt_buildup: "Drainage failure",
  waste_collection_gap: "Waste collection gap",
  water_main_leak: "Water main leak",
  road_base_failure: "Road surface failure",
  heavy_rainfall: "Rainfall flooding",
  electrical_fault: "Electrical network fault",
  construction_damage: "Construction damage",
};

type Edge = { from: CausalNode; to: CausalNode; strength: number; why: string };

/** cause → effect, with strength 0..1 (how often the cause produces the effect). */
export const EDGES: Edge[] = [
  { from: "heavy_rainfall", to: "waterlogging", strength: 0.7, why: "Heavy rain overwhelms drains" },
  { from: "blocked_drain", to: "waterlogging", strength: 0.9, why: "Water cannot drain away" },
  { from: "blocked_drain", to: "drainage", strength: 0.8, why: "A blocked drain overflows or is opened up" },
  { from: "silt_buildup", to: "blocked_drain", strength: 0.6, why: "Silt narrows the drain" },
  { from: "garbage", to: "blocked_drain", strength: 0.6, why: "Waste washes into drains and chokes them" },
  { from: "waste_collection_gap", to: "garbage", strength: 0.85, why: "Missed collection leaves waste on the street" },
  { from: "waterlogging", to: "pothole", strength: 0.65, why: "Standing water softens and breaks asphalt" },
  { from: "waterlogging", to: "footpath", strength: 0.4, why: "Water undermines paving" },
  { from: "water_main_leak", to: "water_leak_sewage", strength: 0.85, why: "A broken main shows up as a leak" },
  { from: "water_main_leak", to: "pothole", strength: 0.55, why: "Escaping water washes out the road base" },
  { from: "water_main_leak", to: "waterlogging", strength: 0.45, why: "Leaking water pools on the road" },
  { from: "road_base_failure", to: "pothole", strength: 0.8, why: "A weak base cracks under traffic" },
  { from: "construction_damage", to: "pothole", strength: 0.4, why: "Trenches are not restored properly" },
  { from: "construction_damage", to: "footpath", strength: 0.55, why: "Work leaves paving broken or blocked" },
  { from: "electrical_fault", to: "streetlight", strength: 0.8, why: "A supply fault takes lights out" },
  { from: "electrical_fault", to: "power_hazard", strength: 0.8, why: "Faulty lines and boxes become exposed" },
  { from: "waterlogging", to: "power_hazard", strength: 0.3, why: "Flood water near live equipment is dangerous" },
];

const children = new Map<CausalNode, Edge[]>();
for (const e of EDGES) children.set(e.from, [...(children.get(e.from) ?? []), e]);

type Path = { prob: number; nodes: CausalNode[]; edges: Edge[] };

/** The strongest causal path from `from` to `to` (product of strengths), up to four steps. */
export function strongestPath(from: CausalNode, to: CausalNode): Path | null {
  if (from === to) return { prob: 1, nodes: [from], edges: [] };
  let best: Path | null = null;
  const walk = (node: CausalNode, prob: number, nodes: CausalNode[], edges: Edge[]) => {
    if (nodes.length > 5) return;
    for (const e of children.get(node) ?? []) {
      if (nodes.includes(e.to)) continue;
      const p = prob * e.strength;
      if (e.to === to) {
        if (!best || p > best.prob) best = { prob: p, nodes: [...nodes, e.to], edges: [...edges, e] };
      } else {
        walk(e.to, p, [...nodes, e.to], [...edges, e]);
      }
    }
  };
  walk(from, 1, [from], []);
  return best;
}

const relatednessCache = new Map<string, number>();

/** How strongly two visible problems are linked: the best shared cause explaining both (0..1). */
export function relatedness(a: Category, b: Category): number {
  if (a === b) return 1;
  const key = a < b ? `${a}|${b}` : `${b}|${a}`;
  const cached = relatednessCache.get(key);
  if (cached !== undefined) return cached;
  let best = Math.max(strongestPath(a, b)?.prob ?? 0, strongestPath(b, a)?.prob ?? 0);
  for (const cause of [...LATENT_CAUSES, ...EDGES.map((e) => e.from)]) {
    const pa = strongestPath(cause, a)?.prob ?? 0;
    const pb = strongestPath(cause, b)?.prob ?? 0;
    best = Math.max(best, Math.sqrt(pa * pb));
  }
  relatednessCache.set(key, best);
  return best;
}

export type GraphNode = { id: CausalNode; label: string; observed: number; root: boolean };
export type GraphEdge = { from: CausalNode; to: CausalNode; strength: number; why: string };

export type RootCauseResult = {
  cause: CausalNode;
  label: string;
  /** Share of the observed problems this cause explains, weighted by how many reports each has. */
  coverage: number;
  /** 0..1, how much better the best cause fits than the runner up and how much it explains. */
  confidence: number;
  /** Every candidate, best first. */
  ranked: { cause: CausalNode; score: number }[];
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
};

/**
 * Infers the likely root cause behind a set of observed problems.
 * Each candidate cause scores the noisy-OR of its path strengths to every observed category,
 * weighted by log(1 + reports). Recent heavy rain gives rainfall a prior boost.
 */
export function inferRootCause(observed: Partial<Record<Category, number>>, opts: { recentRainMm?: number } = {}): RootCauseResult {
  const cats = (Object.entries(observed) as [Category, number][]).filter(([, n]) => n > 0);
  const totalWeight = cats.reduce((s, [, n]) => s + Math.log1p(n), 0) || 1;
  const candidates: CausalNode[] = [...LATENT_CAUSES, ...cats.map(([c]) => c)];

  const scored = [...new Set(candidates)].map((cause) => {
    let explained = 0;
    for (const [cat, n] of cats) {
      // Downstream: the cause produces what people see. Upstream: what people see feeds the cause
      // (garbage choking a drain), which supports it a little less.
      const down = strongestPath(cause, cat)?.prob ?? 0;
      const up = (strongestPath(cat, cause)?.prob ?? 0) * 0.8;
      explained += Math.max(down, up) * Math.log1p(n);
    }
    let score = explained / totalWeight;
    // Prefer an upstream explanation of several problems over naming one of them.
    if (!LATENT_CAUSES.includes(cause as LatentCause)) score *= 0.85;
    if (cause === "heavy_rainfall") score *= Math.min(1.25, 0.6 + (opts.recentRainMm ?? 0) / 40);
    return { cause, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0] ?? { cause: "other" as CausalNode, score: 0 };
  const second = scored[1]?.score ?? 0;
  const coverage = Math.min(1, top.score);
  const margin = top.score > 0 ? (top.score - second) / top.score : 0;
  const confidence = Math.max(0.05, Math.min(0.97, coverage * (0.55 + 0.45 * margin) + (cats.length > 1 ? 0.1 : 0)));

  // The explanation graph: the best path from the root to every observed category.
  const nodes = new Map<CausalNode, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const addNode = (id: CausalNode) => {
    if (!nodes.has(id)) nodes.set(id, { id, label: NODE_LABELS[id], observed: observed[id as Category] ?? 0, root: id === top.cause });
  };
  addNode(top.cause);
  for (const [cat] of cats) {
    const down = strongestPath(top.cause, cat);
    const up = strongestPath(cat, top.cause);
    const path = (down?.prob ?? 0) >= (up?.prob ?? 0) * 0.8 ? down : up;
    if (!path || path.prob < 0.15) {
      addNode(cat);
      continue;
    }
    path.nodes.forEach(addNode);
    for (const e of path.edges) edges.set(`${e.from}>${e.to}`, { from: e.from, to: e.to, strength: e.strength, why: e.why });
  }

  return {
    cause: top.cause,
    label: NODE_LABELS[top.cause],
    coverage,
    confidence,
    ranked: scored,
    graph: { nodes: [...nodes.values()], edges: [...edges.values()] },
  };
}

/** For a recurring problem: the most likely systemic cause of its category. */
export function systemicCause(category: Category, recentRainMm = 0): { cause: CausalNode; label: string } {
  const result = inferRootCause({ [category]: 3 }, { recentRainMm });
  const latent = result.ranked.find((r) => LATENT_CAUSES.includes(r.cause as LatentCause)) ?? result.ranked[0]!;
  return { cause: latent.cause, label: NODE_LABELS[latent.cause] };
}
