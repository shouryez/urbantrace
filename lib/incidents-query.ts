// Server only: incidents and alerts for the map, the incident page and the authority console.
import { scenarioSchema, type Category, type Scenario } from "@/lib/ai/schemas";
import type { GraphEdge, GraphNode, RootCauseResult } from "@/lib/intel/causal";
import type { IncidentFactor } from "@/lib/intel/incidents";
import type { IssueFeature } from "@/lib/issues";
import { fetchIssues } from "@/lib/issues-query";
import { supabaseAdmin } from "@/lib/supabase/server";

export type Incident = {
  id: number;
  kind: "cluster" | "alert";
  status: "active" | "resolved";
  title: string;
  rootCause: string | null;
  explanation: string | null;
  confidence: number;
  lat: number;
  lng: number;
  radiusM: number;
  reportCount: number;
  issueCount: number;
  categories: Partial<Record<Category, number>>;
  firstAt: string | null;
  lastAt: string | null;
  graph: {
    nodes: GraphNode[];
    edges: GraphEdge[];
    ranked?: { cause: string; score: number }[];
    reasons?: string[];
    issueIds?: number[];
    areaKm2?: number;
    pValue?: number;
    windowMinutes?: number;
    locations?: number;
    coverage?: number;
    factors?: IncidentFactor[];
    explains?: RootCauseResult["explains"];
    action?: string;
    /** For an alert: the incident its reports belong to. */
    relatedIncidentId?: number | null;
    baseline?: number;
  } | null;
  scenario: Scenario | null;
  updatedAt: string;
};

type Row = {
  id: number;
  kind: "cluster" | "alert";
  status: "active" | "resolved";
  title: string;
  root_cause: string | null;
  explanation: string | null;
  confidence: number | null;
  radius_m: number;
  report_count: number;
  issue_count: number;
  categories: Partial<Record<Category, number>> | null;
  first_at: string | null;
  last_at: string | null;
  graph: Incident["graph"];
  scenario: unknown;
  updated_at: string;
};

function toIncident(r: Row, p: { lat: number; lng: number } | undefined): Incident {
  const s = scenarioSchema.safeParse(r.scenario);
  return {
    id: r.id,
    kind: r.kind,
    status: r.status,
    title: r.title,
    rootCause: r.root_cause,
    explanation: r.explanation,
    confidence: r.confidence ?? 0,
    lat: p?.lat ?? 0,
    lng: p?.lng ?? 0,
    radiusM: r.radius_m,
    reportCount: r.report_count,
    issueCount: r.issue_count,
    categories: r.categories ?? {},
    firstAt: r.first_at,
    lastAt: r.last_at,
    graph: r.graph,
    scenario: s.success ? s.data : null,
    updatedAt: r.updated_at,
  };
}

/** Incidents and alerts, active first, newest first. */
export async function listIncidents(opts: { status?: "active" | "resolved" | "all"; kind?: "cluster" | "alert"; limit?: number } = {}): Promise<Incident[]> {
  const db = supabaseAdmin();
  let q = db.from("incidents").select("*").order("updated_at", { ascending: false }).limit(opts.limit ?? 200);
  if (opts.status !== "all") q = q.eq("status", opts.status ?? "active");
  if (opts.kind) q = q.eq("kind", opts.kind);
  const [{ data, error }, { data: points }] = await Promise.all([q, db.rpc("incident_points")]);
  if (error) throw new Error(`Reading incidents failed: ${error.message}`);
  const where = new Map(((points ?? []) as { id: number; lat: number; lng: number }[]).map((p) => [p.id, p]));
  return ((data ?? []) as Row[]).map((r) => toIncident(r, where.get(r.id)));
}

/** One incident with the issues it groups (for alerts, the issues in its burst). */
export async function getIncident(id: number): Promise<{ incident: Incident; issues: IssueFeature[] } | null> {
  const db = supabaseAdmin();
  const [{ data }, { data: points }] = await Promise.all([db.from("incidents").select("*").eq("id", id).maybeSingle(), db.rpc("incident_points")]);
  if (!data) return null;
  const p = ((points ?? []) as { id: number; lat: number; lng: number }[]).find((x) => x.id === id);
  const incident = toIncident(data as Row, p);
  const d = Math.max(0.01, (incident.radiusM * 1.6) / 111_000);
  const around = await fetchIssues([incident.lng - d * 1.05, incident.lat - d, incident.lng + d * 1.05, incident.lat + d], {}, 500);
  const ids = new Set(incident.graph?.issueIds ?? []);
  const issues = around.filter((f) => (incident.kind === "alert" ? ids.has(f.properties.id) : f.properties.incidentId === id));
  return { incident, issues };
}
