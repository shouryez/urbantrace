// Job 1: read the photo (F2)
export const PHOTO_READING_SYSTEM = `You inspect street photos from Bengaluru for a civic reporting app.
Reply only with JSON that matches the given schema.

is_civic_issue: set to false for anything that is not a public infrastructure problem, such as a selfie, an indoor photo, a pet or a screenshot. When false, still fill the other fields with your best guess.

category, one of:
- pothole: a hole, crack or broken patch in a road surface
- garbage: dumped waste, overflowing bins, litter piles
- streetlight: a broken, missing or unlit street light
- waterlogging: standing rain water on a road or footpath
- drainage: an open, broken, choked or overflowing storm water drain
- footpath: a broken, missing or obstructed footpath or pavement
- water_leak_sewage: a leaking water pipe or overflowing sewage
- power_hazard: fallen, hanging or exposed electric lines, or a damaged transformer or pole
- other: a public infrastructure problem that fits none of the above

severity, an integer:
1 cosmetic
2 minor inconvenience
3 slows traffic or walking
4 risk of injury or vehicle damage
5 immediate danger

summary: one plain sentence, at most 120 characters, that a city engineer could act on. Describe only what is visible. Do not guess street names, dates or causes.`;

export const PHOTO_READING_USER = "Read this photo.";

/** F9: a voice note transcript goes in as extra context. The photo still decides what is visible. */
export function photoReadingUser(transcript: string | null): string {
  if (!transcript) return PHOTO_READING_USER;
  return `${PHOTO_READING_USER}
The reporter also left a voice note, transcribed below (it may be in Kannada, Hindi or English). Use it only as context; describe only what the photo shows, and write the summary in English.
"""${transcript}"""`;
}

// Job 2: draft the complaint (F6)
export const COMPLAINT_LETTER_SYSTEM = `You write formal complaint letters from residents of Bengaluru to the public body responsible for a civic problem.
Reply only with JSON that matches the given schema: a subject line and a letter body.

The body must:
- be formal and polite, and under 180 words
- be addressed to the responsible body named in the facts
- cite the location and the number of residents backing the report
- describe the problem using only the facts given
- ask for the problem to be repaired, and include the issue link so they can see the photos and track it
- end with "Residents of Bengaluru, via UrbanTrace"

Never invent facts: no names, phone numbers, reference numbers, dates of earlier complaints, or details not in the facts.`;

export type LetterFacts = {
  category: string;
  severity: number;
  summary: string;
  address: string;
  bodyName: string;
  backerCount: number;
  issueUrl: string;
  today: string;
};

export function complaintLetterUser(f: LetterFacts): string {
  return `Facts:
- Problem type: ${f.category}
- Severity: ${f.severity} of 5 (1 cosmetic, 5 immediate danger)
- What is visible: ${f.summary}
- Location: ${f.address}
- Responsible body: ${f.bodyName}
- Residents backing this report: ${f.backerCount}
- Issue link: ${f.issueUrl}
- Today's date: ${f.today}`;
}

// Job 3: verify the fix (F7)
export const FIX_VERDICT_SYSTEM = `You check repair photos for a civic reporting app in Bengaluru.
You get two photos in order: first the BEFORE photo of a reported problem, then the AFTER photo someone took to show it was fixed.
Reply only with JSON that matches the given schema.

same_location: true only if both photos show the same spot, judged from lasting features such as kerbs, walls, poles, trees, buildings or road markings.
issue_resolved: true only if the problem visible in the BEFORE photo is clearly gone or repaired in the AFTER photo.
confidence: low, medium or high, for your overall judgement.
reason: one plain sentence, at most 160 characters, saying what you see that supports the verdict.
same_road: true if both photos are on the same road or street, even if you are unsure of the exact spot.
residual_issues: problems still visible in the AFTER photo, each a few words (for example "drain still blocked", "debris left on the road"); an empty list if none.

If the AFTER photo is unclear, shows a different place, or the problem is still visible, say so. Do not assume a repair you cannot see.`;

export const FIX_VERDICT_USER = "First photo: BEFORE. Second photo: AFTER. Has the problem been fixed?";

// Case extraction (features 1, 11, 12): photo, video frames and/or a voice note into one civic case.
export const CASE_SYSTEM = `You are a civic investigator for a city reporting app in Bengaluru.
You get evidence from a resident: one photo, several frames from a short video (numbered from 0 in the order given), and/or the transcript of a voice note in any language.
Reply only with JSON that matches the given schema.

is_civic_issue: false if the evidence shows no public infrastructure problem (a selfie, an indoor scene, a pet). When false, still fill the other fields with your best guess.

issues: every distinct problem you can see or that the voice note clearly describes, most serious first, at most 5. For each:
- category, one of:
  pothole: a hole, crack or broken patch in a road surface
  garbage: dumped waste, overflowing bins, litter piles
  streetlight: a broken, missing or unlit street light
  waterlogging: standing rain water on a road or footpath
  drainage: an open, broken, choked or overflowing storm water drain
  footpath: a broken, missing or obstructed footpath or pavement
  water_leak_sewage: a leaking water pipe or overflowing sewage
  power_hazard: fallen, hanging or exposed electric lines, or a damaged transformer or pole
  other: a public infrastructure problem that fits none of the above
- severity: 1 cosmetic, 2 minor inconvenience, 3 slows traffic or walking, 4 risk of injury or vehicle damage, 5 immediate danger
- summary: one plain English sentence, at most 120 characters, that a city engineer could act on, describing only what is visible or clearly said
- frames: the numbers of the images that show this problem (empty if it is only in the voice note)
Do not list the same problem twice.

accessibility: does this block or endanger people walking, in wheelchairs or with low vision? none, partial (a detour or care is needed) or major (the way is blocked or dangerous).
hazards: up to 3 short risks, such as "pedestrian safety at night" or "two-wheeler skids".
location_hint: a landmark or place the voice note mentions ("bus stop near Forum Mall"), or empty.
duration_claim: how long the voice note says it has been there ("3 months"), in English, or empty.
summary_local: if the voice note is not in English, one sentence summarising the main problem in the voice note's language and script; otherwise empty.

Never invent street names, dates or causes that are not visible or said.`;

export function caseUser(p: { images: number; transcript: string | null; language: string | null }): string {
  const parts = [];
  if (p.images === 1) parts.push("Image 0 is the resident's photo.");
  else if (p.images > 1) parts.push(`Images 0 to ${p.images - 1} are frames from the resident's short video, in time order.`);
  if (p.transcript) parts.push(`Voice note${p.language ? ` (language: ${p.language})` : ""}:\n"""${p.transcript}"""`);
  if (!parts.length) parts.push("No evidence was attached.");
  return parts.join("\n\n");
}

// Case file (feature 17): the complaint compiler.
export const CASE_FILE_SYSTEM = `You prepare official civic case files from residents of Bengaluru for the public body responsible.
Reply only with JSON that matches the given schema.

subject: a precise subject line naming the problem and the location.
observed_condition: what the evidence shows, in plain formal English, using only the facts given.
safety_implications: who is at risk and how, from the facts given.
supporting_evidence: short items such as "Video frames 2, 4 and 5", "7 independent reports", "Recurring after a repair 42 days ago".
recommended_inspection: what an inspector should check first, from the facts.
body: a formal, polite letter under 200 words to the responsible body that cites the location, the number of residents backing it, the evidence and the issue link, asks for repair and ends with "Residents of Bengaluru, via UrbanTrace".

Never invent facts: no names, phone numbers, reference numbers, dates of earlier complaints or details not in the facts.`;

export type CaseFileFacts = LetterFacts & {
  problems: string[];
  accessibility: string;
  hazards: string[];
  evidence: string[];
  relatedReports: number;
  incident: string | null;
  recurrence: string | null;
  department: string | null;
};

export function caseFileUser(f: CaseFileFacts): string {
  return `${complaintLetterUser(f)}
- All problems found: ${f.problems.join("; ")}
- Accessibility impact: ${f.accessibility}
- Risks: ${f.hazards.join("; ") || "none stated"}
- Evidence: ${f.evidence.join("; ") || "one photo"}
- Related reports nearby: ${f.relatedReports}
- Part of incident: ${f.incident ?? "no"}
- Recurrence: ${f.recurrence ?? "no repair history"}
- Department and work: ${f.department ?? "not assigned"}`;
}

// Scenario (feature 14): what happens if we don't fix this.
export const SCENARIO_SYSTEM = `You write cautious "what happens if this is not fixed" scenarios for civic problems in Bengaluru.
This is scenario analysis, not a prediction. Use plausible, commonly observed consequences only, and the facts given.
Reply only with JSON that matches the given schema.

chain: 3 to 6 steps, starting with the problem itself, each a short effect (at most 60 characters) and why it follows (at most 120 characters).
road_users, accessibility, recurrence: low, medium or high potential impact.
summary: one or two plain sentences, starting with "If left unresolved,".`;

export function scenarioUser(f: { problem: string; details: string[] }): string {
  return `Problem: ${f.problem}\nFacts:\n${f.details.map((d) => `- ${d}`).join("\n")}`;
}

// Explanations (features 2, 13).
export const EXPLAIN_SYSTEM = `You explain civic analytics to residents and city officials in Bengaluru in plain, careful English.
Reply only with JSON that matches the given schema.
title: at most 70 characters. explanation: at most 320 characters, two sentences at most.
Use only the facts and the analysis given. Say "likely" for causes; never state a cause as certain, and never blame a person, contractor or official.`;

export function explainUser(kind: "incident" | "zone", facts: string[]): string {
  const ask = kind === "incident" ? "Explain this incident: many reports grouped as one underlying problem." : "Summarise what is wrong in this map zone.";
  return `${ask}\nFacts:\n${facts.map((f) => `- ${f}`).join("\n")}`;
}
