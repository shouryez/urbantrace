// Demo data (Build Plan, Testing > Demo data): about 25 issues across Bengaluru from the benchmark
// photos, in mixed statuses, so the map, landing page and dashboard look alive. Then the civic
// intelligence scenarios: a drainage failure cluster in Koramangala (root cause graph), a burst of
// waterlogging reports in Bellandur (civic alert), and a pothole in HSR Layout that keeps coming
// back (recurrence and repair history). The city's priorities, incidents and alerts are recomputed
// at the end. Say in the pitch that these are seeded.
//
//   npm run seed:demo                 seed (drafts letters with the model; takes a few minutes)
//   npm run seed:demo -- --no-letters seed without letters
//   npm run seed:demo -- --clear      remove every seeded issue and its photos
//
// Uses bench/labels.csv (civic photos) and bench/pairs.csv (fixed pairs become verified issues).
// A photo's `credit` column (author, licence, source) is stored with it and shown on the issue page.
// Photos go through the same clean up and blur as real reports. Seeded reports carry the device id
// "seed-demo", which is how --clear finds them. Corporations follow a rough guess per area, because
// boundary files are not loaded yet.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { askVision, embed, issueEmbeddingText } from "@/lib/ai/ollama";
import { PHOTO_READING_SYSTEM, PHOTO_READING_USER } from "@/lib/ai/prompts";
import { CATEGORIES, photoReadingJsonSchema, photoReadingSchema, type Category } from "@/lib/ai/schemas";
import { reversePlace } from "@/lib/geocode";
import { segmentKey } from "@/lib/intel/geo";
import { refreshCity } from "@/lib/intel-server/refresh";
import { cleanForStorage, toModelImage } from "@/lib/images";
import { logEvent } from "@/lib/issue-detail";
import { generateLetter } from "@/lib/letter";
import { blurPhoto } from "@/lib/ml";
import { agencyFor, responsibleBody, type CorporationId } from "@/lib/routing";
import { PHOTO_BUCKET, supabaseAdmin } from "@/lib/supabase/server";

process.loadEnvFile(".env.local");

const SEED_DEVICE = "seed-demo";
const ORIGIN = process.env.SEED_ORIGIN ?? "http://localhost:3000";
const DAY = 86_400_000;

// Neighbourhoods across the city with a rough corporation guess (no boundary files yet).
const PLACES: [name: string, lat: number, lng: number, corp: CorporationId][] = [
  ["Koramangala", 12.9352, 77.6245, "south"],
  ["Indiranagar", 12.9784, 77.6408, "east"],
  ["Jayanagar", 12.925, 77.5938, "south"],
  ["Malleshwaram", 13.0035, 77.571, "central"],
  ["Whitefield", 12.9698, 77.75, "east"],
  ["HSR Layout", 12.9116, 77.6474, "south"],
  ["BTM Layout", 12.9166, 77.6101, "south"],
  ["Hebbal", 13.0358, 77.597, "north"],
  ["Yelahanka", 13.1007, 77.5963, "north"],
  ["Rajajinagar", 12.991, 77.555, "west"],
  ["Basavanagudi", 12.9422, 77.576, "south"],
  ["Marathahalli", 12.9569, 77.7011, "east"],
  ["KR Puram", 13.0076, 77.695, "east"],
  ["Banashankari", 12.9255, 77.5468, "west"],
  ["Vijayanagar", 12.9719, 77.537, "west"],
  ["Yeshwanthpur", 13.0285, 77.54, "north"],
  ["Ulsoor", 12.9817, 77.623, "central"],
  ["Frazer Town", 12.998, 77.614, "central"],
  ["JP Nagar", 12.9063, 77.5857, "south"],
  ["Bellandur", 12.926, 77.6762, "east"],
  ["RT Nagar", 13.021, 77.596, "north"],
  ["Kengeri", 12.9077, 77.485, "west"],
  ["Peenya", 13.0285, 77.5197, "west"],
  ["MG Road", 12.9756, 77.606, "central"],
  ["Shivajinagar", 12.9857, 77.6057, "central"],
];

// Fixed seed so a re-seed looks the same.
let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
/** A shuffled copy (Fisher-Yates), so photos are used once each before any repeats. */
const shuffled = <T>(xs: readonly T[]): T[] => {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
};

function parseCsv(text: string): Record<string, string>[] {
  const [head, ...lines] = text.trim().split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#"));
  if (!head) return [];
  const cols = head.split(",").map((c) => c.trim());
  return lines.map((line) => Object.fromEntries(line.split(",").map((v, i) => [cols[i] ?? `c${i}`, v.trim()])));
}

const db = supabaseAdmin();

async function storePhoto(file: string, folder: "reports" | "verifications"): Promise<{ path: string; buf: Buffer }> {
  const buf = await blurPhoto(await cleanForStorage(await readFile(join("bench", "photos", file))));
  const path = `${folder}/${crypto.randomUUID()}.jpg`;
  const { error } = await db.storage.from(PHOTO_BUCKET).upload(path, buf, { contentType: "image/jpeg" });
  if (error) throw new Error(`Upload of ${file} failed: ${error.message}`);
  return { path, buf };
}

async function summaryFor(buf: Buffer, category: Category): Promise<string> {
  try {
    const reading = await askVision(PHOTO_READING_SYSTEM, PHOTO_READING_USER, [await toModelImage(buf)], photoReadingJsonSchema, photoReadingSchema);
    if (reading.is_civic_issue) return reading.summary;
  } catch {
    // fall through
  }
  return `${category.replaceAll("_", " ")} reported by residents`.replace(/^./, (c) => c.toUpperCase());
}

async function setEventTimes(issueId: number, times: Date[]): Promise<void> {
  const { data } = await db.from("issue_events").select("id").eq("issue_id", issueId).order("id");
  for (const [i, e] of (data ?? []).entries()) {
    const at = times[Math.min(i, times.length - 1)]!;
    await db.from("issue_events").update({ created_at: at.toISOString() }).eq("id", e.id);
  }
}

async function clear(): Promise<void> {
  const { data: reports } = await db.from("reports").select("issue_id").eq("device_id", SEED_DEVICE);
  const ids = [...new Set((reports ?? []).map((r) => r.issue_id as number))];
  const { data: linked } = await db.from("issues").select("incident_id").in("id", ids.length ? ids : [0]).not("incident_id", "is", null);
  const incidentIds = [...new Set((linked ?? []).map((r) => r.incident_id as number))];
  if (!ids.length) {
    console.log("No seeded issues.");
    return;
  }
  const [{ data: photos }, { data: afters }] = await Promise.all([
    db.from("reports").select("photo_path").in("issue_id", ids),
    db.from("verifications").select("after_photo_path").in("issue_id", ids),
  ]);
  const paths = [...(photos ?? []).map((p) => p.photo_path as string | null), ...(afters ?? []).map((v) => v.after_photo_path as string)].filter(
    (p): p is string => !!p,
  );
  if (paths.length) await db.storage.from(PHOTO_BUCKET).remove(paths);
  const { error } = await db.from("issues").delete().in("id", ids);
  if (error) throw new Error(`Deleting seeded issues failed: ${error.message}`);
  // Incidents that only held seeded issues go too.
  for (const incident of incidentIds) {
    const { count } = await db.from("issues").select("id", { count: "exact", head: true }).eq("incident_id", incident);
    if (!count) await db.from("incidents").delete().eq("id", incident);
  }
  console.log(`Removed ${ids.length} seeded issues, ${paths.length} photos and their incidents.`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--clear")) return clear();
  const letters = !args.includes("--no-letters");

  const allLabels = parseCsv(await readFile(join("bench", "labels.csv"), "utf8"));
  const labels = allLabels.filter(
    (r) => ["true", "1", "yes", "y"].includes((r.is_civic_issue ?? "").toLowerCase()) && CATEGORIES.includes(r.category as Category),
  );
  const pairs = parseCsv(await readFile(join("bench", "pairs.csv"), "utf8").catch(() => "")).filter((p) =>
    ["true", "1", "yes", "y"].includes((p.fixed ?? "").toLowerCase()),
  );
  if (!labels.length) throw new Error("bench/labels.csv has no civic photos; add the labelled test photos first");
  const categoryOf = new Map(allLabels.map((l) => [l.file, l]));

  const now = Date.now();
  // Photos in a before and after pair are kept for the verified issues.
  const inPairs = new Set(pairs.flatMap((p) => [p.before, p.after]));
  const singles = shuffled(labels.filter((l) => !inPairs.has(l.file)));
  if (!singles.length) throw new Error("bench/labels.csv has no civic photos outside the before and after pairs");
  let singleIndex = 0;
  let pairIndex = 0;
  for (const [n, [place, lat0, lng0, corp]] of PLACES.entries()) {
    // About a quarter verified (when fixed pairs exist), two fix claimed, the rest open.
    const verified = pairIndex < pairs.length && n % 4 === 1;
    const fixClaimed = !verified && (n === 6 || n === 17);
    const pair = verified ? pairs[pairIndex++]! : null;
    const label = (pair && categoryOf.get(pair.before ?? "")) || singles[singleIndex++ % singles.length]!;
    const file = pair ? pair.before! : label.file!;
    const category = (label.category ?? "pothole") as Category;
    const severity = Math.min(5, Math.max(1, Number(label.severity) || 3));
    const lat = lat0 + (rand() - 0.5) * 0.0015;
    const lng = lng0 + (rand() - 0.5) * 0.0015;
    const createdAt = new Date(now - (2 + rand() * 28) * DAY);

    const { path, buf } = await storePhoto(file, "reports");
    const summary = await summaryFor(buf, category);
    const { data, error } = await db
      .rpc("submit_report", {
        p_category: category, p_severity: severity, p_summary: summary, p_lng: lng, p_lat: lat,
        p_photo_path: path, p_ai: { seeded: true, ...(label.credit ? { credit: label.credit } : {}) }, p_device: SEED_DEVICE, p_force_new: true,
      })
      .single<{ out_issue_id: number }>();
    if (error || !data) throw new Error(`submit_report failed: ${error?.message}`);
    const id = data.out_issue_id;

    // Routing, as the submit route does it.
    const agency = agencyFor(category);
    const corporationId = agency === "corporation" ? corp : null;
    const where = await reversePlace(lat, lng);
    await db
      .from("issues")
      .update({
        agency, corporation_id: corporationId, address: where.address, road_class: where.roadClass,
        segment_key: segmentKey(where.road, { lat, lng }), created_at: createdAt.toISOString(),
      })
      .eq("id", id);
    await db.from("reports").update({ created_at: createdAt.toISOString() }).eq("issue_id", id);
    await logEvent(id, "routed", { agency, corporation_id: corporationId, body: responsibleBody(agency, corporationId) });

    // More backers, as merged reports over the following days.
    const extra = Math.floor(rand() ** 2 * 14);
    const times = [createdAt, new Date(createdAt.getTime() + 60_000)];
    for (let i = 0; i < extra; i++) {
      await logEvent(id, "merged");
      times.push(new Date(createdAt.getTime() + (i + 1) * (0.2 + rand()) * DAY * 0.6));
    }
    if (extra) await db.from("issues").update({ backer_count: 1 + extra }).eq("id", id);

    let status = "open";
    if (pair) {
      const after = await storePhoto(pair.after!, "verifications");
      const verifiedAt = new Date(Math.min(now - DAY / 4, createdAt.getTime() + (1 + rand() * 9) * DAY));
      await db.from("verifications").insert({
        issue_id: id,
        after_photo_path: after.path,
        location: `SRID=4326;POINT(${lng} ${lat})`,
        distance_m: Math.round(4 + rand() * 20),
        ai_verdict: {
          same_location: true,
          issue_resolved: true,
          confidence: "high",
          reason: "The surface has been repaired. (seeded)",
          ...(categoryOf.get(pair.after ?? "")?.credit ? { credit: categoryOf.get(pair.after ?? "")!.credit } : {}),
        },
        passed: true,
        created_at: verifiedAt.toISOString(),
      });
      await logEvent(id, "fix_claimed");
      await logEvent(id, "verified", { reason: "The surface has been repaired. (seeded)" });
      times.push(new Date(verifiedAt.getTime() - 60_000), verifiedAt);
      await db.from("issues").update({ status: "verified", verified_at: verifiedAt.toISOString() }).eq("id", id);
      status = "verified";
    } else if (fixClaimed) {
      await logEvent(id, "fix_claimed");
      times.push(new Date(now - DAY / 2));
      await db.from("issues").update({ status: "fix_claimed" }).eq("id", id);
      status = "fix_claimed";
    }
    await setEventTimes(id, times);

    try {
      const vector = await embed(issueEmbeddingText(category, summary));
      await db.from("issues").update({ embedding: JSON.stringify(vector) }).eq("id", id);
    } catch (err) {
      console.warn(`  embedding for #${id} skipped: ${String(err)}`);
    }
    if (letters) {
      await generateLetter(id, ORIGIN).catch((err: unknown) => console.warn(`  letter for #${id} skipped: ${String(err)}`));
    }
    console.log(`#${id} ${place}: ${category}, ${status}, ${1 + extra} backers`);
  }
  const byCategory = (c: Category) => labels.filter((l) => l.category === c && !inPairs.has(l.file ?? "")).map((l) => l.file!);
  const scenario = await seedScenarios(byCategory, now);
  console.log("\nRecomputing priorities, incidents and alerts…");
  const intel = await refreshCity();
  console.log(`  ${intel.issues} issues, ${intel.incidents} incidents, ${intel.alerts} new alerts`);
  console.log(`\nSeeded ${PLACES.length + scenario} issues. Remove them with: npm run seed:demo -- --clear`);
}

type ScenarioIssue = {
  category: Category;
  severity: number;
  summary: string;
  lat: number;
  lng: number;
  createdAt: Date;
  photo: string;
  corp: CorporationId;
  accessibility?: "none" | "partial" | "major";
  backers?: number;
  verifiedAt?: Date;
  recurrenceOf?: number;
};

/** One issue with known facts (no vision call), filed and routed as the submit route would. */
async function seedIssue(s: ScenarioIssue): Promise<number> {
  const { path } = await storePhoto(s.photo, "reports");
  const { data, error } = await db
    .rpc("submit_report", {
      p_category: s.category, p_severity: s.severity, p_summary: s.summary, p_lng: s.lng, p_lat: s.lat,
      p_photo_path: path, p_ai: { seeded: true }, p_device: SEED_DEVICE, p_force_new: true,
    })
    .single<{ out_issue_id: number }>();
  if (error || !data) throw new Error(`submit_report failed: ${error?.message}`);
  const id = data.out_issue_id;
  const agency = agencyFor(s.category);
  const corporationId = agency === "corporation" ? s.corp : null;
  const where = await reversePlace(s.lat, s.lng);
  const at = s.createdAt.toISOString();
  await db
    .from("issues")
    .update({
      agency, corporation_id: corporationId, address: where.address, road_class: where.roadClass,
      segment_key: segmentKey(where.road, s), created_at: at, accessibility: s.accessibility ?? "none", backer_count: s.backers ?? 1,
      ...(s.recurrenceOf ? { recurrence_of: s.recurrenceOf } : {}),
      ...(s.verifiedAt ? { status: "verified", verified_at: s.verifiedAt.toISOString(), stage: "verified" } : {}),
    })
    .eq("id", id);
  await db
    .from("reports")
    .update({ created_at: at, extraction: { accessibility: s.accessibility ?? "none", issues: [{ category: s.category, severity: s.severity }] } })
    .eq("issue_id", id);
  await logEvent(id, "routed", { agency, corporation_id: corporationId, body: responsibleBody(agency, corporationId) });
  const times = [s.createdAt, new Date(s.createdAt.getTime() + 60_000)];
  if (s.verifiedAt) {
    await logEvent(id, "fix_claimed");
    await logEvent(id, "verified", { reason: "Repair confirmed from the after photo. (seeded)" });
    times.push(new Date(s.verifiedAt.getTime() - 60_000), s.verifiedAt);
  }
  await setEventTimes(id, times);
  try {
    const vector = await embed(issueEmbeddingText(s.category, s.summary));
    await db.from("issues").update({ embedding: JSON.stringify(vector) }).eq("id", id);
  } catch {
    // embeddings are optional
  }
  return id;
}

async function seedScenarios(photosFor: (c: Category) => string[], now: number): Promise<number> {
  const pick = (c: Category, i: number) => {
    const list = photosFor(c).length ? photosFor(c) : photosFor("pothole");
    return list[i % list.length]!;
  };
  const near = (lat: number, lng: number, m: number) => ({ lat: lat + ((rand() - 0.5) * 2 * m) / 111_000, lng: lng + ((rand() - 0.5) * 2 * m) / 108_000 });
  let n = 0;

  // 1. Drainage failure around one blocked drain in Koramangala, over the last two days.
  const drain = { lat: 12.9339, lng: 77.6186 };
  const cluster: [Category, number, string, "none" | "partial" | "major"][] = [
    ["drainage", 4, "Storm drain is choked with silt and plastic, water backing up onto the road", "partial"],
    ["waterlogging", 4, "Knee deep water pooled across the road after the rain", "major"],
    ["waterlogging", 3, "Standing water covering the footpath outside the bakery", "major"],
    ["pothole", 3, "Potholes opening up where water has been standing for days", "none"],
    ["pothole", 4, "Deep pothole hidden under muddy water near the junction", "partial"],
    ["garbage", 3, "Garbage washed out of the drain and piled at the corner", "none"],
    ["water_leak_sewage", 4, "Sewage smell and overflow from the open drain", "partial"],
    ["footpath", 3, "Broken footpath slabs lifted by water flowing underneath", "major"],
  ];
  for (const [i, [category, severity, summary, accessibility]] of cluster.entries()) {
    const photoCategory: Category = category === "drainage" ? "water_leak_sewage" : category === "footpath" ? "pothole" : category;
    await seedIssue({
      category, severity, summary, ...near(drain.lat, drain.lng, 110), createdAt: new Date(now - (40 - i * 4.5) * 3_600_000),
      photo: pick(photoCategory, i), corp: "south", accessibility, backers: 2 + Math.floor(rand() * 6),
    });
    n++;
  }
  console.log(`Koramangala drainage cluster: ${cluster.length} issues`);

  // 2. A burst of waterlogging reports across Bellandur in the last 40 minutes (civic alert).
  const flood = { lat: 12.9279, lng: 77.6717 };
  const lines = ["Road flooded, two wheelers stalling", "Water entering ground floor shops", "Underpass filling with water", "Drain overflowing onto the main road"];
  for (let i = 0; i < 11; i++) {
    await seedIssue({
      category: i % 4 === 3 ? "drainage" : "waterlogging", severity: 3 + (i % 2), summary: lines[i % 4]!,
      ...near(flood.lat, flood.lng, 650), createdAt: new Date(now - (40 - i * 3.5) * 60_000), photo: pick("waterlogging", i), corp: "east",
      accessibility: i % 3 === 0 ? "major" : "partial",
    });
    n++;
  }
  console.log("Bellandur waterlogging burst: 11 issues");

  // 3. A pothole in HSR Layout: fixed twice, back again (recurrence and repair history).
  const spot = { lat: 12.9121, lng: 77.6446 };
  const first = await seedIssue({
    category: "pothole", severity: 4, summary: "Large pothole in the left lane", ...spot, createdAt: new Date(now - 430 * DAY),
    verifiedAt: new Date(now - 418 * DAY), photo: pick("pothole", 1), corp: "south", backers: 6,
  });
  const second = await seedIssue({
    category: "pothole", severity: 4, summary: "Same pothole is back after the monsoon", ...near(spot.lat, spot.lng, 8), createdAt: new Date(now - 160 * DAY),
    verifiedAt: new Date(now - 150 * DAY), recurrenceOf: first, photo: pick("pothole", 2), corp: "south", backers: 9,
  });
  await db.from("issues").update({ repair_lasted_days: 258 }).eq("id", second);
  await seedIssue({
    category: "pothole", severity: 5, summary: "The patched pothole has broken open again, deeper than before", ...near(spot.lat, spot.lng, 8),
    createdAt: new Date(now - 3 * DAY), photo: pick("pothole", 3), corp: "south", backers: 14,
  });
  n += 3;
  console.log("HSR Layout recurring pothole: 3 issues");
  return n;
}

await main();
