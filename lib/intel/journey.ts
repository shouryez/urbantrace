// "Where does my complaint go?" (feature 18): the case's path from the citizen to a verified fix,
// built from the issue's stage and trail, so the back office is visible as a product feature.

export const STAGES = [
  { key: "reported", label: "You", detail: "Your report, photo and location" },
  { key: "triaged", label: "AI triage", detail: "Problem types, severity and evidence read" },
  { key: "routed", label: "Department", detail: "Matched to the responsible body" },
  { key: "assigned", label: "Zone officer", detail: "Accepted and assigned by the ward office" },
  { key: "field_team", label: "Field team", detail: "Crew and equipment scheduled" },
  { key: "site_visit", label: "Site visit", detail: "Inspected on the ground" },
  { key: "repair", label: "Repair", detail: "Work in progress" },
  { key: "ai_verified", label: "AI verification", detail: "After photo checked against the original" },
  { key: "citizen_verified", label: "You verify", detail: "People who reported it confirm the fix" },
] as const;
export type StageKey = (typeof STAGES)[number]["key"];

/** Stages an authority can move a case to, in order. */
export const AUTHORITY_STAGES: StageKey[] = ["assigned", "field_team", "site_visit", "repair"];

export type JourneyStep = { key: StageKey; label: string; detail: string; state: "done" | "current" | "next"; at: string | null };

type TrailEvent = { kind: string; createdAt: string };

const EVENT_STAGE: Record<string, StageKey> = {
  reported: "reported",
  triaged: "triaged",
  routed: "routed",
  assigned: "assigned",
  field_team: "field_team",
  site_visit: "site_visit",
  repair: "repair",
  fix_claimed: "repair",
  verified: "ai_verified",
  citizen_verified: "citizen_verified",
};

export function journey(stage: string, status: string, events: TrailEvent[]): JourneyStep[] {
  const reached = new Map<StageKey, string>();
  for (const e of events) {
    const s = EVENT_STAGE[e.kind];
    if (s && !reached.has(s)) reached.set(s, e.createdAt);
  }
  // A filed report has been triaged by the model; routing follows immediately.
  const reportedAt = reached.get("reported") ?? null;
  if (reportedAt && !reached.has("triaged")) reached.set("triaged", reportedAt);
  if (status === "verified" && !reached.has("ai_verified")) reached.set("ai_verified", "");

  const stageIndex = Math.max(
    STAGES.findIndex((s) => s.key === stage),
    ...[...reached.keys()].map((k) => STAGES.findIndex((s) => s.key === k)),
  );
  return STAGES.map((s, i) => ({
    key: s.key,
    label: s.label,
    detail: s.detail,
    state: i <= stageIndex ? "done" : i === stageIndex + 1 ? "current" : "next",
    at: reached.get(s.key) || null,
  }));
}
