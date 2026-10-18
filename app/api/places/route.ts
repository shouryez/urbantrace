// GET /api/places?q= (feature 10): place search inside Bengaluru for the accessible route planner.
import { searchPlaces } from "@/lib/geocode";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  return Response.json({ places: await searchPlaces(q) });
}
