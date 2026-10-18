// POST /api/incidents/[id]/scenario (feature 14): what happens if this is not fixed, as a model scenario.
import { incidentScenario } from "@/lib/intel-server/scenario";

export async function POST(_request: Request, ctx: RouteContext<"/api/incidents/[id]/scenario">) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Invalid incident id" }, { status: 400 });
  try {
    const scenario = await incidentScenario(id);
    if (!scenario) return Response.json({ error: "Incident not found" }, { status: 404 });
    return Response.json({ scenario });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Could not build the scenario right now" }, { status: 502 });
  }
}
