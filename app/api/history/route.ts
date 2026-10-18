// GET /api/history?lat=&lng=&radius=&segment= (features 6, 7, 15, 19): the time machine for a place.
import { placeHistory } from "@/lib/intel-server/place";
import { latLngSchema } from "@/lib/reports";

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const point = latLngSchema.safeParse({ lat: Number(p.get("lat")), lng: Number(p.get("lng")) });
  if (!point.success) return Response.json({ error: "Send lat and lng" }, { status: 400 });
  const radius = Math.min(500, Math.max(20, Number(p.get("radius")) || 60));
  const segment = p.get("segment");
  try {
    return Response.json(await placeHistory(point.data, radius, segment && segment.length < 80 ? segment : null));
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Could not load the history" }, { status: 502 });
  }
}
