// The civic causal graph: which underlying problems tend to produce which visible ones.
// Used to group related reports into one incident, to name its likely root cause, and to explain it.
// Edge strengths are hand-set priors from how drainage, roads, waste and power networks fail; they
// are an analytical aid, not a diagnosis. Inference runs in code, so it is fast and explainable.
import { CATEGORIES, type Category } from "@/lib/ai/schemas";

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

const CATEGORY_NODES = CATEGORIES;

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
  /** Share of the observed reports this cause explains through a causal link (strength 0.3 or more). */
  coverage: number;
  /** The posterior probability of the top cause, 0..1. */
  confidence: number;
  /** Every candidate with its posterior probability (`score`), best first; the scores sum to 1. */
  ranked: { cause: CausalNode; score: number }[];
  /** How the top cause accounts for each observed problem: the chain and its strength. */
  explains: { category: Category; reports: number; strength: number; via: CausalNode[]; direction: "causes" | "feeds" | "none" }[];
  /** What a crew should do about the top cause. */
  action: string;
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
};

/**
 * Prior belief in each cause before looking at the reports: how common each failure is in a city
 * like Bengaluru. Visible problems can also be their own root (a lone pothole), with a small prior.
 */
const PRIOR: Record<LatentCause, number> = {
  blocked_drain: 0.18,
  silt_buildup: 0.08,
  waste_collection_gap: 0.14,
  water_main_leak: 0.1,
  road_base_failure: 0.16,
  heavy_rainfall: 0.04,
  electrical_fault: 0.1,
  construction_damage: 0.1,
};
const SELF_PRIOR = 0.03;
/** Chance an observed problem appears with no link to the cause at all (background noise). */
const LEAK = 0.05;

export const CAUSE_ACTIONS: Partial<Record<CausalNode, string>> = {
  blocked_drain: "Desilt and clear the storm drain first; that should drain the water and stop new potholes, then patch the road.",
  silt_buildup: "Desilt the drain line along this stretch before the next rain.",
  waste_collection_gap: "Restore daily garbage pickup and clear the black spot; check the drains it may be choking.",
  water_main_leak: "Send BWSSB to find and fix the leaking main, then restore the road base above it.",
  road_base_failure: "Rebuild the road base, not just a surface patch, or the potholes will return.",
  heavy_rainfall: "Pump out standing water and check the drains are flowing; inspect for damage once it recedes.",
  electrical_fault: "Send BESCOM to trace the supply fault; make exposed equipment safe first.",
  construction_damage: "Make the contractor restore the trench, road and footpath to standard.",
};

/**
 * Infers the likely root cause behind a set of observed problems, as a small Bayesian model.
 *
 * For each candidate cause C, every observed problem k is explained with probability
 *   P(k | C) = 1 - (1 - LEAK)(1 - s)
 * where s is the strongest causal chain from C to k (or 0.8 × the chain from k to C, when what people see
 * feeds the cause, like garbage choking a drain). The log likelihood sums these over the problems,
 * each weighted by log(1 + reports) so one heavily backed issue does not drown the rest. A cause that
 * strongly predicts a problem nobody reported loses a little. Multiplying by the prior and normalising
 * gives each cause's posterior probability. Recent heavy rain raises the prior of rainfall.
 */
export function inferRootCause(observed: Partial<Record<Category, number>>, opts: { recentRainMm?: number } = {}): RootCauseResult {
  const cats = (Object.entries(observed) as [Category, number][]).filter(([, n]) => n > 0);
  const rain = opts.recentRainMm ?? 0;
  const candidates = [...new Set<CausalNode>([...LATENT_CAUSES, ...cats.map(([c]) => c)])];

  const link = (cause: CausalNode, cat: Category) => {
    const down = strongestPath(cause, cat);
    const up = strongestPath(cat, cause);
    const d = down?.prob ?? 0;
    const u = (up?.prob ?? 0) * 0.8;
    return d >= u ? { strength: d, path: down, direction: d > 0 ? ("causes" as const) : ("none" as const) } : { strength: u, path: up, direction: "feeds" as const };
  };

  const logPost = candidates.map((cause) => {
    let ll = 0;
    for (const [cat, n] of cats) ll += Math.log1p(n) * Math.log(1 - (1 - LEAK) * (1 - link(cause, cat).strength));
    // Strong effects of this cause that nobody reported count a little against it.
    for (const e of children.get(cause) ?? []) {
      if (e.strength >= 0.6 && !observed[e.to as Category] && (CATEGORY_NODES as readonly string[]).includes(e.to)) ll += 0.5 * Math.log(1 - 0.5 * e.strength);
    }
    let prior = (LATENT_CAUSES as readonly string[]).includes(cause) ? PRIOR[cause as LatentCause] : SELF_PRIOR;
    if (cause === "heavy_rainfall") prior = 0.02 + Math.min(0.3, rain / 150);
    return { cause, lp: ll + Math.log(prior) };
  });
  const max = Math.max(...logPost.map((x) => x.lp));
  const z = logPost.reduce((s, x) => s + Math.exp(x.lp - max), 0);
  const ranked = logPost.map((x) => ({ cause: x.cause, score: Math.exp(x.lp - max) / z })).sort((a, b) => b.score - a.score);
  const top = ranked[0] ?? { cause: "other" as CausalNode, score: 0 };

  const explains = cats
    .map(([category, reports]) => {
      const l = link(top.cause, category);
      return { category, reports, strength: Math.round(l.strength * 100) / 100, via: l.path?.nodes ?? [], direction: l.strength >= 0.15 ? l.direction : ("none" as const) };
    })
    .sort((a, b) => b.strength - a.strength);
  const totalReports = cats.reduce((s, [, n]) => s + n, 0) || 1;
  const coverage = explains.filter((e) => e.strength >= 0.3).reduce((s, e) => s + e.reports, 0) / totalReports;

  // The explanation graph: the chain from the root to every observed problem it accounts for.
  const nodes = new Map<CausalNode, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const addNode = (id: CausalNode) => {
    if (!nodes.has(id)) nodes.set(id, { id, label: NODE_LABELS[id], observed: observed[id as Category] ?? 0, root: id === top.cause });
  };
  addNode(top.cause);
  for (const e of explains) {
    const path = link(top.cause, e.category).path;
    if (!path || e.direction === "none") {
      addNode(e.category);
      continue;
    }
    path.nodes.forEach(addNode);
    for (const x of path.edges) edges.set(`${x.from}>${x.to}`, { from: x.from, to: x.to, strength: x.strength, why: x.why });
  }

  return {
    cause: top.cause,
    label: NODE_LABELS[top.cause],
    coverage,
    confidence: Math.max(0.05, Math.min(0.97, top.score)),
    ranked,
    explains,
    action: CAUSE_ACTIONS[top.cause] ?? `Inspect and repair the ${NODE_LABELS[top.cause].toLowerCase()} directly.`,
    graph: { nodes: [...nodes.values()], edges: [...edges.values()] },
  };
}

/** For a recurring problem: the most likely systemic cause of its category. */
export function systemicCause(category: Category, recentRainMm = 0): { cause: CausalNode; label: string } {
  const result = inferRootCause({ [category]: 3 }, { recentRainMm });
  const latent = result.ranked.find((r) => LATENT_CAUSES.includes(r.cause as LatentCause)) ?? result.ranked[0]!;
  return { cause: latent.cause, label: NODE_LABELS[latent.cause] };
}
