// Routing (F5): category to agency, in code. The point to corporation lookup is the
// locate_point database function, called from the server.
import type { Category } from "@/lib/ai/schemas";

export const CORPORATION_IDS = ["west", "east", "north", "south", "central"] as const;
export type CorporationId = (typeof CORPORATION_IDS)[number];

// Names follow the plan's pattern; confirm them against official pages (open task in the plan).
export const CORPORATION_NAMES: Record<CorporationId, string> = {
  west: "Bengaluru West City Corporation",
  east: "Bengaluru East City Corporation",
  north: "Bengaluru North City Corporation",
  south: "Bengaluru South City Corporation",
  central: "Bengaluru Central City Corporation",
};

// Total wards across the five corporations, shown on the landing page. Confirm against the
// official delimitation notification, together with the corporation names above.
export const WARD_COUNT = 369;

export type Agency = "corporation" | "BWSSB" | "BESCOM";

const AGENCY_BY_CATEGORY: Record<Category, Agency> = {
  pothole: "corporation",
  garbage: "corporation",
  streetlight: "corporation",
  waterlogging: "corporation",
  drainage: "corporation", // storm water drains are the corporation's; sewage lines are BWSSB's
  footpath: "corporation",
  other: "corporation",
  water_leak_sewage: "BWSSB",
  power_hazard: "BESCOM",
};

export function agencyFor(category: Category): Agency {
  return AGENCY_BY_CATEGORY[category];
}

export function isCorporationId(id: string | null | undefined): id is CorporationId {
  return !!id && (CORPORATION_IDS as readonly string[]).includes(id);
}

/** Name of the body an issue is routed to, for the routing card, the trail and the letter. */
export function responsibleBody(agency: Agency, corporationId: string | null): string {
  if (agency === "BWSSB") return "Bangalore Water Supply and Sewerage Board (BWSSB)";
  if (agency === "BESCOM") return "Bangalore Electricity Supply Company (BESCOM)";
  return isCorporationId(corporationId) ? CORPORATION_NAMES[corporationId] : "the City Corporation";
}
