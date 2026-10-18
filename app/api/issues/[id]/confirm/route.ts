// POST /api/issues/[id]/confirm (feature 18, the "you verify" step): people who reported an issue
// confirm whether the fix is real. Two confirmations close the loop; a majority saying it is not
// fixed reopens the issue.
import { z } from "zod";
import { refreshIssueIntel } from "@/lib/intel-server/issue";
import { logEvent } from "@/lib/issue-detail";
import { supabaseAdmin } from "@/lib/supabase/server";

const bodySchema = z.object({ deviceId: z.uuid(), fixed: z.boolean(), note: z.string().trim().max(200).optional() });

export async function POST(request: Request, ctx: RouteContext<"/api/issues/[id]/confirm">) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Invalid issue id" }, { status: 400 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Send deviceId and fixed" }, { status: 400 });
  const { deviceId, fixed, note } = parsed.data;
  const db = supabaseAdmin();

  const [{ data: issue }, { data: backed }] = await Promise.all([
    db.from("issues").select("status, backer_count").eq("id", id).maybeSingle<{ status: string; backer_count: number }>(),
    db.from("reports").select("id").eq("issue_id", id).eq("device_id", deviceId).limit(1),
  ]);
  if (!issue) return Response.json({ error: "Issue not found" }, { status: 404 });
  if (!backed?.length) return Response.json({ error: "Only people who reported this issue can confirm the fix" }, { status: 403 });
  if (issue.status !== "verified") return Response.json({ error: "The fix has not been verified yet" }, { status: 409 });

  await db.from("citizen_confirmations").upsert({ issue_id: id, device_id: deviceId, fixed, note: note ?? null });
  const { data: all } = await db.from("citizen_confirmations").select("fixed").eq("issue_id", id);
  const yes = (all ?? []).filter((c) => c.fixed).length;
  const no = (all ?? []).length - yes;

  let state: "confirmed" | "disputed" | "waiting" = "waiting";
  if (no > yes && no >= 2) {
    state = "disputed";
    await db.from("issues").update({ status: "open", stage: "repair", verified_at: null }).eq("id", id);
    await logEvent(id, "citizen_disputed", { yes, no });
    await refreshIssueIntel(id);
  } else if (yes >= Math.min(2, issue.backer_count)) {
    state = "confirmed";
    await db.from("issues").update({ stage: "citizen_verified" }).eq("id", id);
    await logEvent(id, "citizen_verified", { yes, no });
  }
  return Response.json({ state, yes, no });
}
