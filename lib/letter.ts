// Server only: the complaint compiler (features 6 and 17). Turns an issue's evidence, history and
// analysis into a structured case file and a formal letter, stored on the issue.
import { askVision } from "@/lib/ai/ollama";
import { CASE_FILE_SYSTEM, caseFileUser, COMPLAINT_LETTER_SYSTEM, complaintLetterUser, type CaseFileFacts } from "@/lib/ai/prompts";
import {
  CATEGORY_LABELS,
  caseFileJsonSchema,
  caseFileSchema,
  complaintLetterJsonSchema,
  complaintLetterSchema,
  type CaseFile,
  type ComplaintLetter,
} from "@/lib/ai/schemas";
import { getIssue } from "@/lib/issue-detail";
import { supabaseAdmin } from "@/lib/supabase/server";

/** Public origin of this request, so the letter's issue link works through the tunnel. */
export function requestOrigin(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

/** Compiles the case file and letter with the current evidence and stores them on the issue. */
export async function generateLetter(issueId: number, origin: string): Promise<ComplaintLetter | null> {
  const issue = await getIssue(issueId);
  if (!issue || !issue.bodyName) return null;
  const db = supabaseAdmin();

  const base = {
    category: CATEGORY_LABELS[issue.category],
    severity: issue.severity,
    summary: issue.summary,
    address: issue.address ?? `${issue.lat.toFixed(5)}, ${issue.lng.toFixed(5)}`,
    bodyName: issue.bodyName,
    backerCount: issue.backerCount,
    issueUrl: `${origin}/issue/${issue.id}`,
    today: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }),
  };

  // Evidence, in the words an inspector would want.
  const problems = new Set<string>([`${CATEGORY_LABELS[issue.category]}: ${issue.summary}`]);
  const hazards = new Set<string>();
  const evidence: string[] = [];
  let videoFrames: number[] = [];
  for (const r of issue.reports) {
    for (const p of r.extraction?.issues ?? []) {
      problems.add(`${CATEGORY_LABELS[p.category]}: ${p.summary}`);
      if (p.category === issue.category && r.media === "video") videoFrames = p.frames;
    }
    for (const h of r.extraction?.hazards ?? []) hazards.add(h);
  }
  const videos = issue.reports.filter((r) => r.media === "video").length;
  const photos = issue.reports.filter((r) => r.media === "photo").length;
  const voices = issue.reports.filter((r) => r.transcript).length;
  if (videos) evidence.push(videoFrames.length ? `Video frames ${videoFrames.map((f) => f + 1).join(", ")}` : `${videos} short video${videos > 1 ? "s" : ""}`);
  if (photos) evidence.push(`${photos} photo${photos > 1 ? "s" : ""}`);
  if (voices) evidence.push(`${voices} voice note${voices > 1 ? "s" : ""}`);
  if (issue.evidence) evidence.push(`${issue.evidence.independentReports} independent reports`);

  let incident: string | null = null;
  let relatedReports = issue.backerCount;
  if (issue.incidentId !== null) {
    const { data } = await db.from("incidents").select("title, report_count").eq("id", issue.incidentId).maybeSingle();
    if (data) {
      incident = `${data.title as string} (${data.report_count as number} reports nearby)`;
      relatedReports = data.report_count as number;
    }
  }
  const recurrence =
    issue.recurrenceOf !== null ? `Returned ${issue.repairLastedDays ?? "some"} days after a verified repair (earlier issue #${issue.recurrenceOf})` : null;
  if (recurrence) evidence.push("Recurring after a repair");

  const facts: CaseFileFacts = {
    ...base,
    problems: [...problems].slice(0, 6),
    accessibility: issue.accessibility === "none" ? "none reported" : `${issue.accessibility} obstruction for people on foot`,
    hazards: [...hazards].slice(0, 4),
    evidence,
    relatedReports,
    incident,
    recurrence,
    department: issue.assignment ? `${issue.assignment.department}, ${issue.assignment.workType}` : null,
  };

  let caseFile: CaseFile | null = null;
  let letter: ComplaintLetter;
  try {
    caseFile = await askVision(CASE_FILE_SYSTEM, caseFileUser(facts), [], caseFileJsonSchema, caseFileSchema);
    letter = { subject: caseFile.subject, body: caseFile.body };
  } catch (err) {
    console.error(`Case file for issue ${issueId} failed, drafting a plain letter:`, err);
    letter = await askVision(COMPLAINT_LETTER_SYSTEM, complaintLetterUser(base), [], complaintLetterJsonSchema, complaintLetterSchema);
  }

  const { error } = await db
    .from("issues")
    .update({ complaint_letter: JSON.stringify(letter), ...(caseFile ? { case_file: caseFile } : {}) })
    .eq("id", issueId);
  if (error) throw new Error(`Storing the letter failed: ${error.message}`);
  return letter;
}
