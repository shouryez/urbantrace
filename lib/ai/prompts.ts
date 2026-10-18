// Job 1: read the photo (F2)
export const PHOTO_READING_SYSTEM = `You inspect street photos from Bengaluru for a civic reporting app.
Reply only with JSON that matches the given schema.

is_civic_issue: set to false for anything that is not a public infrastructure problem, such as a selfie, an indoor photo, a pet or a screenshot. When false, still fill the other fields with your best guess.

category, one of:
- pothole: a hole, crack or broken patch in a road surface
- garbage: dumped waste, overflowing bins, litter piles
- streetlight: a broken, missing or unlit street light
- waterlogging: standing rain water on a road or footpath
- water_leak_sewage: a leaking water pipe, open drain or overflowing sewage
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

If the AFTER photo is unclear, shows a different place, or the problem is still visible, say so. Do not assume a repair you cannot see.`;

export const FIX_VERDICT_USER = "First photo: BEFORE. Second photo: AFTER. Has the problem been fixed?";
