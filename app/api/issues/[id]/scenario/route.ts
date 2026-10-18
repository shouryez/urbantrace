// POST /api/issues/[id]/scenario (feature 14): what happens if this is not fixed, as a model scenario.
import { issueScenario } from "@/lib/intel-server/scenario";

export async function POST(_request: Request, ctx: RouteContext<"/api/issues/[id]/scenario">) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Invalid issue id" }, { status: 400 });
  try {
    const scenario = await issueScenario(id);
    if (!scenario) return Response.json({ error: "Issue not found" }, { status: 404 });
    return Response.json({ scenario });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Could not build the scenario right now" }, { status: 502 });
  }
}
