// POST /api/issues/[id]/letter (F6): regenerate the complaint letter with the current backer count.
import { ModelReplyError } from "@/lib/ai/ollama";
import { generateLetter, requestOrigin } from "@/lib/letter";

export async function POST(request: Request, ctx: RouteContext<"/api/issues/[id]/letter">) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Invalid issue id" }, { status: 400 });
  try {
    const letter = await generateLetter(id, requestOrigin(request));
    if (!letter) return Response.json({ error: "Issue not found or not routed yet" }, { status: 404 });
    return Response.json(letter);
  } catch (err) {
    console.error(`Letter for issue ${id} failed:`, err);
    const message =
      err instanceof ModelReplyError ? "The model could not draft a valid letter, try again" : "The model is not responding, try again";
    return Response.json({ error: message }, { status: 502 });
  }
}
