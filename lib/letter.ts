// Server only: Job 2, the complaint letter (F6).
import { askVision } from "@/lib/ai/ollama";
import { COMPLAINT_LETTER_SYSTEM, complaintLetterUser } from "@/lib/ai/prompts";
import { CATEGORY_LABELS, complaintLetterJsonSchema, complaintLetterSchema, type ComplaintLetter } from "@/lib/ai/schemas";
import { getIssue } from "@/lib/issue-detail";
import { supabaseAdmin } from "@/lib/supabase/server";

/** Public origin of this request, so the letter's issue link works through the tunnel. */
export function requestOrigin(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

/** Drafts the letter with the current backer count and stores it on the issue. */
export async function generateLetter(issueId: number, origin: string): Promise<ComplaintLetter | null> {
  const issue = await getIssue(issueId);
  if (!issue || !issue.bodyName) return null;

  const letter = await askVision(
    COMPLAINT_LETTER_SYSTEM,
    complaintLetterUser({
      category: CATEGORY_LABELS[issue.category],
      severity: issue.severity,
      summary: issue.summary,
      address: issue.address ?? `${issue.lat.toFixed(5)}, ${issue.lng.toFixed(5)}`,
      bodyName: issue.bodyName,
      backerCount: issue.backerCount,
      issueUrl: `${origin}/issue/${issue.id}`,
      today: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }),
    }),
    [],
    complaintLetterJsonSchema,
    complaintLetterSchema,
  );
  const { error } = await supabaseAdmin()
    .from("issues")
    .update({ complaint_letter: JSON.stringify(letter) })
    .eq("id", issueId);
  if (error) throw new Error(`Storing the letter failed: ${error.message}`);
  return letter;
}
