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
import { placeHistory } from "@/lib/intel-server/place";
import { getIssue } from "@/lib/issue-detail";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recentRainMm } from "@/lib/weather";

/** Public origin of this request, so the letter's issue link works through the tunnel. */
export function requestOrigin(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

/** Compiles the case file and letter with the current evidence and stores them on the issue. */
/** The history of the spot, as short plain lines for the case file: earlier reports, repairs, rain. */
async function historyLines(issue: NonNullable<Awaited<ReturnType<typeof getIssue>>>): Promise<string[]> {
  try {
    const h = await placeHistory({ lat: issue.lat, lng: issue.lng }, 60, issue.segmentKey);
    const others = h.issues.filter((i) => i.id !== issue.id);
    const lines: string[] = [];
    if (others.length) lines.push(`${others.length} other report${others.length > 1 ? "s" : ""} within 60 m since ${others.map((i) => i.createdAt.slice(0, 7)).sort()[0]}`);
    const repaired = others.filter((i) => i.verifiedAt);
    if (repaired.length) lines.push(`${repaired.length} verified repair${repaired.length > 1 ? "s" : ""} here before`);
    if (h.segment.lastRepairDaysAgo !== null) lines.push(`Last repair on this road segment ${h.segment.lastRepairDaysAgo} days ago`);
    if (h.rain.pattern === "strong" || h.rain.pattern === "some") lines.push(h.rain.summary);
    const rain = await recentRainMm(7).catch(() => 0);
    if (rain >= 10) lines.push(`${Math.round(rain)} mm of rain in the last 7 days`);
    return lines;
  } catch (err) {
    console.error("Place history for the case file failed:", err);
    return [];
  }
}

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
    answers: [...new Set(issue.reports.flatMap((r) => r.followUp.map((a) => `${a.question} ${a.answer}`)))].slice(0, 12),
    history: await historyLines(issue),
    ward: issue.ward ? `${issue.ward.name} (ward ${issue.ward.number}, ${issue.ward.zoneName} zone)` : null,
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
