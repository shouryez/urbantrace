// GET /api/zones/[cell] (feature 13): what's wrong around me, for one ~1 km geohash cell.
import { zoneReport } from "@/lib/intel-server/place";

export async function GET(_request: Request, ctx: RouteContext<"/api/zones/[cell]">) {
  const cell = (await ctx.params).cell;
  if (!/^[0-9b-hjkmnp-z]{5,7}$/.test(cell)) return Response.json({ error: "Invalid zone" }, { status: 400 });
  try {
    return Response.json(await zoneReport(cell));
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Could not load the zone" }, { status: 502 });
  }
}
