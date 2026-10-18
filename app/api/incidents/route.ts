// GET /api/incidents?status=active|resolved|all&kind=cluster|alert (features 2, 3, 16): incidents and alerts.
import { listIncidents } from "@/lib/incidents-query";

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const status = p.get("status");
  const kind = p.get("kind");
  try {
    const incidents = await listIncidents({
      status: status === "resolved" || status === "all" ? status : "active",
      kind: kind === "cluster" || kind === "alert" ? kind : undefined,
    });
    return Response.json({ incidents });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Could not load incidents" }, { status: 502 });
  }
}
