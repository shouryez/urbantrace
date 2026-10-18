// POST /api/reports/questions: follow-up questions for a case the model has just read. The duration
// question always comes first; the model adds what only someone on the spot can answer. If the model
// fails, a fixed set is returned so the reporter is never blocked.
import { z } from "zod";
import { askVision } from "@/lib/ai/ollama";
import { FOLLOW_UP_SYSTEM, followUpUser } from "@/lib/ai/prompts";
import { DURATION_QUESTION, followUpJsonSchema, followUpSchema, type FollowUpQuestion } from "@/lib/ai/schemas";

const bodySchema = z.object({
  problems: z.array(z.string().trim().min(1).max(200)).min(1).max(6),
  address: z.string().trim().max(300).nullable().default(null),
  hazards: z.array(z.string().trim().max(120)).max(6).default([]),
  accessibility: z.string().trim().max(20).default("none"),
  transcript: z.string().trim().max(2000).nullable().default(null),
});

const FALLBACK: FollowUpQuestion[] = [
  { id: "harm", question: "Has anyone been hurt or a vehicle damaged here?", kind: "choice", options: ["Yes", "Near misses", "Not that I know"], why: "Harm raises the priority." },
  { id: "rain", question: "Does it get worse when it rains?", kind: "choice", options: ["Much worse", "A little", "No", "Not sure"], why: "Points to drainage as a cause." },
  { id: "who", question: "Who mostly uses this spot?", kind: "choice", options: ["School children", "Elderly or wheelchair users", "Heavy traffic", "Local residents"], why: "Tells the team who is at risk." },
];

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Send the problems found" }, { status: 400 });
  let asked: FollowUpQuestion[] = FALLBACK;
  try {
    const reply = await askVision(FOLLOW_UP_SYSTEM, followUpUser(parsed.data), [], followUpJsonSchema, followUpSchema);
    // Choice questions need options; drop any the model left without them, and any duration repeats.
    const usable = reply.questions.filter((q) => (q.kind === "text" || q.options.length >= 2) && !/how long/i.test(q.question));
    if (usable.length) asked = usable.map((q) => (q.kind === "text" ? { ...q, options: [] } : q));
  } catch (err) {
    console.error("Follow-up questions failed, using the fixed set:", err);
  }
  return Response.json({ questions: [DURATION_QUESTION, ...asked.slice(0, 4)] });
}
