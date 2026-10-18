// Model benchmark (Build Plan, Testing > Model benchmark).
//
//   npm run benchmark                       all three models
//   npm run benchmark -- gemma4:e4b         just one
//
// Reads bench/labels.csv (file,category,severity,is_civic_issue[,group]) and bench/pairs.csv
// (before,after,fixed), with the photos in bench/photos/. Runs Job 1 on every photo and Job 3 on
// every pair, through the same prompts, schemas and image preparation the app uses, and writes the
// table to bench/results.md. Photos of the same problem can share a `group` id; the script then
// suggests the F12 similarity threshold from their summary embeddings.

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { askVision, embed, issueEmbeddingText } from "@/lib/ai/ollama";
import { FIX_VERDICT_SYSTEM, FIX_VERDICT_USER, PHOTO_READING_SYSTEM, PHOTO_READING_USER } from "@/lib/ai/prompts";
import {
  CATEGORIES,
  fixVerdictJsonSchema,
  fixVerdictSchema,
  photoReadingJsonSchema,
  photoReadingSchema,
  type Category,
  type PhotoReading,
} from "@/lib/ai/schemas";
import { cleanForStorage, toModelImage } from "@/lib/images";
import { passesVerification } from "@/lib/verify";

process.loadEnvFile(".env.local");

const BENCH = "bench";
const DEFAULT_MODELS = ["gemma4:e4b", "qwen3-vl:8b-instruct", "gemma4:e2b"];

type Label = { file: string; category: Category; severity: number; isCivic: boolean; group: string | null };
type Pair = { before: string; after: string; fixed: boolean };

function parseCsv(text: string): Record<string, string>[] {
  const [head, ...lines] = text.trim().split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#"));
  if (!head) return [];
  const cols = head.split(",").map((c) => c.trim());
  return lines.map((line) => Object.fromEntries(line.split(",").map((v, i) => [cols[i] ?? `c${i}`, v.trim()])));
}

const truthy = (v: string | undefined) => ["true", "1", "yes", "y"].includes((v ?? "").toLowerCase());

async function loadLabels(): Promise<Label[]> {
  return parseCsv(await readFile(join(BENCH, "labels.csv"), "utf8")).map((r, i) => {
    const category = r.category as Category;
    const isCivic = truthy(r.is_civic_issue);
    if (isCivic && !CATEGORIES.includes(category)) throw new Error(`labels.csv row ${i + 2}: unknown category "${r.category}"`);
    return { file: r.file ?? "", category, severity: Number(r.severity), isCivic, group: r.group || null };
  });
}

async function loadPairs(): Promise<Pair[]> {
  try {
    return parseCsv(await readFile(join(BENCH, "pairs.csv"), "utf8")).map((r) => ({
      before: r.before ?? "",
      after: r.after ?? "",
      fixed: truthy(r.fixed),
    }));
  } catch {
    return [];
  }
}

const images = new Map<string, string>();
/** The same preparation as the app: clean for storage, then the 1024 px model copy. */
async function image(file: string): Promise<string> {
  let img = images.get(file);
  if (!img) {
    img = await toModelImage(await cleanForStorage(await readFile(join(BENCH, "photos", file))));
    images.set(file, img);
  }
  return img;
}

const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}% (${n}/${d})` : "–");

type ModelResult = {
  model: string;
  category: [number, number];
  severity: [number, number];
  rejection: [number, number];
  verification: [number, number];
  failures: number;
  seconds: number;
  readings: Map<string, PhotoReading>;
};

async function benchModel(model: string, labels: Label[], pairs: Pair[]): Promise<ModelResult> {
  const r: ModelResult = {
    model, category: [0, 0], severity: [0, 0], rejection: [0, 0], verification: [0, 0], failures: 0, seconds: 0,
    readings: new Map(),
  };
  const times: number[] = [];

  // Load the model first so the cold start does not count towards speed.
  process.stdout.write(`\n${model}: loading… `);
  if (labels[0]) {
    await askVision(PHOTO_READING_SYSTEM, PHOTO_READING_USER, [await image(labels[0].file)], photoReadingJsonSchema, photoReadingSchema, model).catch(() => null);
  }
  console.log("ready");

  for (const label of labels) {
    const img = await image(label.file);
    const t = performance.now();
    let reading: PhotoReading | null = null;
    try {
      reading = await askVision(PHOTO_READING_SYSTEM, PHOTO_READING_USER, [img], photoReadingJsonSchema, photoReadingSchema, model);
    } catch {
      r.failures++;
    }
    times.push((performance.now() - t) / 1000);
    if (reading) r.readings.set(label.file, reading);

    if (label.isCivic) {
      r.category[1]++;
      r.severity[1]++;
      if (reading?.is_civic_issue && reading.category === label.category) r.category[0]++;
      if (reading && Math.abs(reading.severity - label.severity) <= 1) r.severity[0]++;
    } else {
      r.rejection[1]++;
      if (reading && !reading.is_civic_issue) r.rejection[0]++;
    }
    console.log(`  ${label.file}: ${reading ? `${reading.is_civic_issue ? reading.category : "not an issue"} ${reading.severity}` : "FAILED"}`);
  }

  for (const pair of pairs) {
    const imgs = [await image(pair.before), await image(pair.after)];
    const t = performance.now();
    let passed: boolean | null = null;
    try {
      const verdict = await askVision(FIX_VERDICT_SYSTEM, FIX_VERDICT_USER, imgs, fixVerdictJsonSchema, fixVerdictSchema, model);
      passed = passesVerification(0, verdict); // the GPS half of the rule is plain code, tested separately
    } catch {
      r.failures++;
    }
    times.push((performance.now() - t) / 1000);
    r.verification[1]++;
    if (passed === pair.fixed) r.verification[0]++;
    console.log(`  ${pair.before} -> ${pair.after}: ${passed === null ? "FAILED" : passed ? "fixed" : "not fixed"} (label ${pair.fixed ? "fixed" : "not fixed"})`);
  }

  r.seconds = median(times);
  return r;
}

/** F12: cosine distances between summaries of the same problem and of different problems. */
async function suggestThreshold(labels: Label[], readings: Map<string, PhotoReading>): Promise<string | null> {
  const grouped = labels.filter((l) => l.group && readings.get(l.file)?.is_civic_issue);
  if (grouped.length < 3) return null;
  const vectors = new Map<string, number[]>();
  for (const l of grouped) {
    const reading = readings.get(l.file)!;
    vectors.set(l.file, await embed(issueEmbeddingText(reading.category, reading.summary)));
  }
  const cos = (a: number[], b: number[]) => {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i]! * b[i]!;
      na += a[i]! ** 2;
      nb += b[i]! ** 2;
    }
    return 1 - dot / Math.sqrt(na * nb);
  };
  const same: number[] = [];
  const different: number[] = [];
  for (let i = 0; i < grouped.length; i++) {
    for (let j = i + 1; j < grouped.length; j++) {
      const a = grouped[i]!, b = grouped[j]!;
      (a.group === b.group ? same : different).push(cos(vectors.get(a.file)!, vectors.get(b.file)!));
    }
  }
  if (!same.length || !different.length) return null;
  const worstSame = Math.max(...same);
  const closestDifferent = Math.min(...different);
  const suggestion = worstSame < closestDifferent ? (worstSame + closestDifferent) / 2 : median(same);
  return (
    `F12 threshold: same problem up to ${worstSame.toFixed(3)}, different problems from ${closestDifferent.toFixed(3)}. ` +
    `Suggested EMBED_MATCH_MAX_DISTANCE = ${suggestion.toFixed(2)}${worstSame >= closestDifferent ? " (the two overlap; check by hand)" : ""}.`
  );
}

async function main() {
  const models = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_MODELS;
  const labels = await loadLabels();
  const pairs = await loadPairs();
  if (!labels.length) throw new Error("bench/labels.csv has no rows; add the labelled test photos first");
  console.log(`${labels.length} photos, ${pairs.length} before and after pairs, models: ${models.join(", ")}`);

  const results: ModelResult[] = [];
  for (const model of models) results.push(await benchModel(model, labels, pairs));

  // Highest category accuracy wins; a tie goes to the faster model.
  const ranked = [...results].sort((a, b) => b.category[0] / (b.category[1] || 1) - a.category[0] / (a.category[1] || 1) || a.seconds - b.seconds);
  const winner = ranked[0]!;

  const row = (label: string, f: (r: ModelResult) => string) => `| ${label} | ${results.map(f).join(" | ")} |`;
  const table = [
    `| Measure | ${results.map((r) => `\`${r.model}\``).join(" | ")} |`,
    `| --- | ${results.map(() => "---").join(" | ")} |`,
    row("Category accuracy", (r) => pct(...r.category)),
    row("Severity within 1", (r) => pct(...r.severity)),
    row("Non issue rejection", (r) => pct(...r.rejection)),
    row("Verification accuracy", (r) => pct(...r.verification)),
    row("Median seconds per call", (r) => (Number.isNaN(r.seconds) ? "–" : r.seconds.toFixed(1))),
    row("Invalid replies after retry", (r) => String(r.failures)),
  ].join("\n");

  const threshold = await suggestThreshold(labels, winner.readings).catch((err: unknown) => `F12 threshold: skipped (${String(err)})`);
  const date = new Date().toISOString().slice(0, 10);
  const md = `# Model benchmark, ${date}\n\n${labels.length} photos and ${pairs.length} before and after pairs.\n\n${table}\n\nWinner: \`${winner.model}\` (highest category accuracy; ties go to the faster model).\n${threshold ? `\n${threshold}\n` : ""}`;
  await writeFile(join(BENCH, "results.md"), md);
  console.log(`\n${md}\nWritten to bench/results.md`);
}

await main();
