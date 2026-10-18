// F14: export the open dataset of consented, blurred photos as a Hugging Face image folder.
//
//   node scripts/export-dataset.ts [out-dir]      (default: dataset/)
//
// Only reports with dataset_consent are included. Photos are already blurred (F11) because
// consent is only recorded while the model service is on. Coordinates are rounded to 3
// decimals (about 100 m); device ids and voice note transcripts are left out. A consented
// after photo of the same issue is added as its before and after pair.
//
// Publish (needs a Hugging Face account and `hf auth login`):
//   hf upload <user>/urbantrace-bengaluru dataset/ --repo-type dataset

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");

const out = process.argv[2] ?? "dataset";
const db = createClient(url, key, { auth: { persistSession: false } });
const round = (n: number) => Math.round(n * 1000) / 1000;

type Issue = { id: number; category: string; severity: number; summary: string; status: string; depth_class: string | null };
type Report = { id: number; issue_id: number; photo_path: string; created_at: string; issues: Issue };
type Verification = { id: number; issue_id: number; after_photo_path: string; passed: boolean; created_at: string };

async function download(path: string, to: string): Promise<void> {
  const { data, error } = await db.storage.from("photos").download(path);
  if (error || !data) throw new Error(`Download of ${path} failed: ${error?.message}`);
  await writeFile(to, Buffer.from(await data.arrayBuffer()));
}

/** A report's location; the geography column comes back as WKB, so the database converts it. */
async function reportPoint(id: number): Promise<{ lat: number; lng: number }> {
  const { data, error } = await db.rpc("report_point", { p_id: id });
  const row = (data as { lat: number; lng: number }[] | null)?.[0];
  if (error || !row) throw new Error(`Location of report ${id} failed: ${error?.message ?? "not found"}`);
  return row;
}

async function main() {
  const { data: reports, error } = await db
    .from("reports")
    .select("id, issue_id, photo_path, created_at, issues(id, category, severity, summary, status, depth_class)")
    .eq("dataset_consent", true)
    .order("id")
    .returns<Report[]>();
  if (error) throw new Error(`Reading reports failed: ${error.message}`);

  const issueIds = [...new Set((reports ?? []).map((r) => r.issue_id))];
  const { data: afters, error: afterError } = issueIds.length
    ? await db
        .from("verifications")
        .select("id, issue_id, after_photo_path, passed, created_at")
        .eq("dataset_consent", true)
        .in("issue_id", issueIds)
        .order("created_at", { ascending: false })
        .returns<Verification[]>()
    : { data: [] as Verification[], error: null };
  if (afterError) throw new Error(`Reading verifications failed: ${afterError.message}`);
  // The latest consented after photo per issue, preferring one that passed.
  const afterByIssue = new Map<number, Verification>();
  for (const v of afters ?? []) {
    const current = afterByIssue.get(v.issue_id);
    if (!current || (!current.passed && v.passed)) afterByIssue.set(v.issue_id, v);
  }

  await mkdir(join(out, "images"), { recursive: true });
  const rows: string[] = [];
  for (const r of reports ?? []) {
    const fileName = `images/report-${r.id}.jpg`;
    await download(r.photo_path, join(out, fileName));
    const after = afterByIssue.get(r.issue_id);
    let afterName: string | null = null;
    if (after) {
      afterName = `images/after-${after.id}.jpg`;
      await download(after.after_photo_path, join(out, afterName));
    }
    const { lat, lng } = await reportPoint(r.id);
    rows.push(
      JSON.stringify({
        file_name: fileName,
        issue_id: r.issue_id,
        category: r.issues.category,
        severity: r.issues.severity,
        summary: r.issues.summary,
        depth_class: r.issues.depth_class,
        status: r.issues.status,
        lat: round(lat),
        lng: round(lng),
        reported_on: r.created_at.slice(0, 10),
        after_file_name: afterName,
        fix_verified: after ? after.passed : null,
      }),
    );
  }

  await writeFile(join(out, "metadata.jsonl"), rows.join("\n") + (rows.length ? "\n" : ""));
  await writeFile(join(out, "README.md"), datasheet(rows.length, afterByIssue.size));
  console.log(`Wrote ${rows.length} photos and ${afterByIssue.size} before and after pairs to ${out}/`);
}

function datasheet(photos: number, pairs: number): string {
  return `---
license: cc-by-4.0
pretty_name: UrbanTrace Bengaluru civic issues
task_categories:
  - image-classification
language:
  - en
tags:
  - civic-tech
  - bengaluru
  - potholes
size_categories:
  - n<1K
---

# UrbanTrace Bengaluru civic issues

Street photos of civic problems in Bengaluru (potholes, garbage, streetlights, waterlogging, water leaks and sewage, power line hazards), reported through UrbanTrace, an open source civic reporting app, by residents who opted in. ${photos} photos, ${pairs} with an after photo of the same spot.

## Fields

- \`file_name\`: the report photo
- \`category\`, \`severity\` (1 to 5), \`summary\`: the reading of an open weight model (Gemma 4 E4B through Ollama), as corrected by the reporter
- \`depth_class\`: for potholes, a rough class (shallow, moderate, deep) estimated from relative depth with Depth Anything V2 Small; not a measurement
- \`status\`: open, fix_claimed or verified when exported
- \`lat\`, \`lng\`: rounded to 3 decimals, about 100 m
- \`reported_on\`: date only
- \`after_file_name\`, \`fix_verified\`: the after photo of the same spot and whether the model and the 50 m GPS check confirmed the fix

## Collection and privacy

- Every reporter ticked "Allow this blurred photo in the open dataset"; the box is off by default.
- Faces and number plates were blurred (YuNet face detector and an open YOLOv9 plate detector) before the photo was stored; detection can miss, so report any photo that needs removal.
- Phone EXIF data, including GPS tags, was stripped. No device ids, names or voice notes are included.

## Licence

CC BY 4.0. Attribution: Team Code Not Found, UrbanTrace contributors.
`;
}

await main();
