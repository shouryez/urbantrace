// POST /api/issues/[id]/stage (feature 18): the authority moves a case along its journey.
import { z } from "zod";
import { isAuthority } from "@/lib/authority";
import { AUTHORITY_STAGES } from "@/lib/intel/journey";
import { logEvent } from "@/lib/issue-detail";
import { supabaseAdmin } from "@/lib/supabase/server";

const bodySchema = z.object({ stage: z.enum(AUTHORITY_STAGES), note: z.string().trim().max(200).optional() });

export async function POST(request: Request, ctx: RouteContext<"/api/issues/[id]/stage">) {
  if (!(await isAuthority())) return Response.json({ error: "Authority sign in needed" }, { status: 401 });
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Invalid issue id" }, { status: 400 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Unknown stage" }, { status: 400 });
  const { stage, note } = parsed.data;
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("issues")
    .update({ stage, updated_at: new Date().toISOString() })
    .eq("id", id)
    .neq("status", "verified")
    .select("id");
  if (error) return Response.json({ error: "Could not update the case" }, { status: 502 });
  if (!data?.length) return Response.json({ error: "Case not found or already verified" }, { status: 409 });
  await logEvent(id, stage, note ? { note } : undefined);
  return Response.json({ stage });
}
