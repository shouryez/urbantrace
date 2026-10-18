// GET /api/incidents/[id] (features 2, 3): one incident with its root cause graph and issues.
import { getIncident } from "@/lib/incidents-query";

export async function GET(_request: Request, ctx: RouteContext<"/api/incidents/[id]">) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Invalid incident id" }, { status: 400 });
  const found = await getIncident(id).catch((err: unknown) => {
    console.error(err);
    return undefined;
  });
  if (found === undefined) return Response.json({ error: "Could not load the incident" }, { status: 502 });
  if (!found) return Response.json({ error: "Incident not found" }, { status: 404 });
  return Response.json(found);
}
