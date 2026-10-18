// Server only: "what happens if we don't fix this?" (feature 14) for an issue or an incident.
// A model-generated scenario from the facts and the causal graph; always labelled as such.
import { askVision } from "@/lib/ai/ollama";
import { SCENARIO_SYSTEM, scenarioUser } from "@/lib/ai/prompts";
import { CATEGORY_LABELS, scenarioJsonSchema, scenarioSchema, type Category, type Scenario } from "@/lib/ai/schemas";
import { getIssue } from "@/lib/issue-detail";
import { EDGES, NODE_LABELS, type CausalNode } from "@/lib/intel/causal";
import { supabaseAdmin } from "@/lib/supabase/server";

/** Known downstream effects of a node in the causal graph, as hints for the scenario. */
function downstream(node: CausalNode): string[] {
  return EDGES.filter((e) => e.from === node).map((e) => `${NODE_LABELS[e.from]} can lead to ${NODE_LABELS[e.to].toLowerCase()}: ${e.why.toLowerCase()}`);
}

export async function issueScenario(issueId: number): Promise<Scenario | null> {
  const issue = await getIssue(issueId);
  if (!issue) return null;
  const details = [
    `Severity ${issue.severity} of 5; ${issue.backerCount} residents reported it`,
    `What is visible: ${issue.summary}`,
    `Road type: ${issue.roadClass ?? "unknown"}; accessibility impact: ${issue.accessibility}`,
    issue.recurrenceOf !== null ? `It has come back after a repair ${issue.repairLastedDays ?? "?"} days earlier` : "No repair history",
    issue.priority ? `Priority ${issue.priority.score}/100 (${issue.priority.reason})` : "",
    ...downstream(issue.category),
  ].filter(Boolean);
  const scenario = await askVision(SCENARIO_SYSTEM, scenarioUser({ problem: `${CATEGORY_LABELS[issue.category]} at ${issue.address ?? "this spot"}`, details }), [], scenarioJsonSchema, scenarioSchema);
  await supabaseAdmin().from("issues").update({ scenario }).eq("id", issueId);
  return scenario;
}

export async function incidentScenario(incidentId: number): Promise<Scenario | null> {
  const db = supabaseAdmin();
  const { data: inc } = await db.from("incidents").select("title, root_cause, report_count, radius_m, categories, explanation").eq("id", incidentId).maybeSingle();
  if (!inc) return null;
  const cats = Object.entries((inc.categories ?? {}) as Partial<Record<Category, number>>).map(([c, n]) => `${CATEGORY_LABELS[c as Category]} (${n})`);
  const details = [
    `${inc.report_count as number} reports within ${Math.round(inc.radius_m as number)} m: ${cats.join(", ")}`,
    `Likely root cause: ${NODE_LABELS[inc.root_cause as CausalNode] ?? inc.root_cause}`,
    (inc.explanation as string | null) ?? "",
    ...downstream(inc.root_cause as CausalNode),
  ].filter(Boolean);
  const scenario = await askVision(SCENARIO_SYSTEM, scenarioUser({ problem: inc.title as string, details }), [], scenarioJsonSchema, scenarioSchema);
  await db.from("incidents").update({ scenario }).eq("id", incidentId);
  return scenario;
}
