// GET /api/issues?bbox=minLng,minLat,maxLng,maxLat&status=&category=&corporation= (F3)
// Issues in the visible map area as GeoJSON.
import { issuesQuerySchema, type IssueCollection } from "@/lib/issues";
import { fetchIssues } from "@/lib/issues-query";

export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = issuesQuerySchema.safeParse(params);
  if (!parsed.success) return Response.json({ error: "Send bbox=minLng,minLat,maxLng,maxLat" }, { status: 400 });
  const { bbox, ...filters } = parsed.data;

  try {
    const collection: IssueCollection = { type: "FeatureCollection", features: await fetchIssues(bbox, filters) };
    return Response.json(collection);
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Could not load issues" }, { status: 502 });
  }
}
