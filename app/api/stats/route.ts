// GET /api/stats (F10): city-wide counters, as on the landing page: issues reported, people
// backing them and fixes verified.
import { getCityStats } from "@/lib/issues-query";

export async function GET() {
  const stats = await getCityStats();
  if (!stats) return Response.json({ error: "Could not load the counters" }, { status: 502 });
  return Response.json(stats);
}
