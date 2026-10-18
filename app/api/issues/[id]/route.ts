// GET /api/issues/[id] (F8): one issue with its reports, verifications and events.
import { getIssue } from "@/lib/issue-detail";

export async function GET(_request: Request, ctx: RouteContext<"/api/issues/[id]">) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Invalid issue id" }, { status: 400 });
  try {
    const issue = await getIssue(id);
    if (!issue) return Response.json({ error: "Issue not found" }, { status: 404 });
    return Response.json(issue);
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Could not load the issue" }, { status: 502 });
  }
}
