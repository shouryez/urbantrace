// GET /api/weather (feature 15): daily rainfall for the last 90 days and the city-wide link between
// rain and water and road reports. Weather data by Open-Meteo.com (CC BY 4.0).
import type { Category } from "@/lib/ai/schemas";
import { rainImpact } from "@/lib/intel/rain";
import { CITY_BBOX, fetchIssues } from "@/lib/issues-query";
import { rainByDay } from "@/lib/weather";

const WATER = new Set<Category>(["waterlogging", "drainage", "water_leak_sewage", "pothole"]);

export async function GET() {
  try {
    const [rain, issues] = await Promise.all([rainByDay(90), fetchIssues(CITY_BBOX, {}, 2000)]);
    const water = issues.filter((f) => WATER.has(f.properties.category)).map((f) => f.properties.createdAt);
    return Response.json({
      days: [...rain].map(([day, mm]) => ({ day, mm })),
      impact: rainImpact(water, rain, { label: "water and road reports" }),
      attribution: "Weather data by Open-Meteo.com",
    });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Could not load the weather" }, { status: 502 });
  }
}
