// GET /api/account/reports?device=<uuid>: "My reports" — every issue this account or this device has
// reported or backed, with where each one stands now.
import { z } from "zod";
import { currentAccount, myReports } from "@/lib/account";

export async function GET(request: Request) {
  const device = z.uuid().safeParse(new URL(request.url).searchParams.get("device"));
  const user = await currentAccount().catch(() => null);
  const reports = await myReports(user?.id ?? null, device.success ? device.data : null);
  return Response.json({ reports, signedIn: !!user });
}
