// POST /api/intel/refresh (authority): recompute every issue's intelligence, incidents across the
// city and alerts. Handy after seeding demo data or loading boundaries.
import { isAuthority } from "@/lib/authority";
import { refreshCity } from "@/lib/intel-server/refresh";

export async function POST() {
  if (!(await isAuthority())) return Response.json({ error: "Authority sign in needed" }, { status: 401 });
  try {
    return Response.json(await refreshCity());
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Refresh failed" }, { status: 502 });
  }
}
