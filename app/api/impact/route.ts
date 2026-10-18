// GET /api/impact?device= (feature 20): one person's civic impact. No names, points or leaderboard.
import { z } from "zod";
import { impactFor } from "@/lib/intel-server/place";

export async function GET(request: Request) {
  const device = z.uuid().safeParse(new URL(request.url).searchParams.get("device"));
  if (!device.success) return Response.json({ error: "Send device" }, { status: 400 });
  try {
    return Response.json(await impactFor(device.data));
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Could not load your impact" }, { status: 502 });
  }
}
