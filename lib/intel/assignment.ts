// AI assignment engine (feature 8): from a structured problem to department, sub-department, work
// type, crew and equipment. Rules live in code so they are auditable. Hours and crew sizes are
// model-generated planning estimates, not official schedules, and no costs are shown.
import type { Category } from "@/lib/ai/schemas";
import type { CausalNode } from "./causal";

export type Assignment = {
  department: string;
  subDepartment: string;
  workType: string;
  crew: number;
  equipment: string[];
  estimatedHours: number;
  urgency: "immediate" | "within 24 hours" | "within a week" | "scheduled";
  note: string;
};

type Rule = Omit<Assignment, "urgency" | "note">;

const RULES: Record<Category, Rule> = {
  pothole: { department: "Roads and Infrastructure", subDepartment: "Road maintenance", workType: "Pothole patching", crew: 3, equipment: ["Hot or cold mix", "Plate compactor"], estimatedHours: 3 },
  drainage: { department: "Storm Water Drains", subDepartment: "Drain maintenance", workType: "Desilting and debris removal", crew: 2, equipment: ["Suction machine"], estimatedHours: 4 },
  waterlogging: { department: "Storm Water Drains", subDepartment: "Flood response", workType: "Dewatering and drain clearing", crew: 3, equipment: ["Dewatering pump", "Suction machine"], estimatedHours: 6 },
  garbage: { department: "Solid Waste Management", subDepartment: "Ward collection", workType: "Waste clearance", crew: 3, equipment: ["Tipper truck"], estimatedHours: 2 },
  streetlight: { department: "Electrical (Streetlights)", subDepartment: "Streetlight maintenance", workType: "Fixture or supply repair", crew: 2, equipment: ["Ladder truck"], estimatedHours: 2 },
  footpath: { department: "Roads and Infrastructure", subDepartment: "Footpaths", workType: "Paving repair or obstruction removal", crew: 2, equipment: ["Paving tools"], estimatedHours: 4 },
  water_leak_sewage: { department: "BWSSB", subDepartment: "Sewerage and water supply maintenance", workType: "Pipe repair or line jetting", crew: 3, equipment: ["Jetting machine", "Excavation tools"], estimatedHours: 5 },
  power_hazard: { department: "BESCOM", subDepartment: "Line maintenance", workType: "Isolate supply and repair", crew: 2, equipment: ["Insulated tools", "Ladder truck"], estimatedHours: 3 },
  other: { department: "City Corporation", subDepartment: "Ward engineer", workType: "Site inspection", crew: 1, equipment: [], estimatedHours: 1 },
};

export function assign(p: {
  category: Category;
  severity: number;
  depthClass?: string | null;
  backerCount: number;
  rootCause?: CausalNode | null;
  isRecurring: boolean;
  priorityBand: "critical" | "high" | "medium" | "low";
}): Assignment {
  const r = { ...RULES[p.category], equipment: [...RULES[p.category].equipment] };
  const notes: string[] = [];

  if (p.category === "pothole") {
    r.estimatedHours = p.depthClass === "deep" ? 5 : p.depthClass === "shallow" ? 2 : 3;
    if (p.isRecurring || p.rootCause === "blocked_drain" || p.rootCause === "water_main_leak" || p.rootCause === "road_base_failure") {
      r.workType = "Base repair, with a drainage check first";
      r.estimatedHours += 3;
      r.equipment.push("Excavator (small)");
      notes.push("Recurring or water-driven damage: patching alone is likely to fail again.");
    }
  }
  if ((p.category === "waterlogging" || p.category === "drainage") && p.rootCause === "waste_collection_gap") {
    notes.push("Coordinate with Solid Waste Management: waste is choking the drain.");
  }
  if (p.backerCount >= 10 || p.severity >= 5) {
    r.crew += 1;
    r.estimatedHours = Math.round(r.estimatedHours * 1.3);
  }

  const urgency: Assignment["urgency"] =
    p.category === "power_hazard" || p.priorityBand === "critical" ? "immediate" : p.priorityBand === "high" ? "within 24 hours" : p.priorityBand === "medium" ? "within a week" : "scheduled";
  notes.push("Crew size and hours are planning estimates.");
  return { ...r, urgency, note: notes.join(" ") };
}
