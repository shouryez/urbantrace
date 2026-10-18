// Loads the 369 wards of the GBA ward delimitation 2025 (boundaries, zone, division, assembly
// constituency, population) from the OpenCity KML, derives each corporation's boundary from its wards,
// assigns existing issues to their corporation and ward, and loads the published contacts, officers
// and MLAs from lib/civic-directory.ts.
//
//   npm run seed:wards                 download the KML from OpenCity
//   npm run seed:wards -- <file.kml>   use a local copy
//
// Needs migration 0008_wards_accounts.sql. Replaces every ward already in the database.

import { readFile } from "node:fs/promises";
import { AS_OF, MLA_SOURCE, MLAS, OFFICERS, OFFICES, WARDS_KML_URL, WARDS_SOURCE } from "@/lib/civic-directory";
import { supabaseAdmin } from "@/lib/supabase/server";

process.loadEnvFile(".env.local");
const db = supabaseAdmin();

type Ward = { fields: Record<string, string>; polygons: number[][][][] };

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();

function ring(text: string): number[][] {
  return text
    .trim()
    .split(/\s+/)
    .map((t) => t.split(",").slice(0, 2).map(Number))
    .filter((p) => p.length === 2 && p.every(Number.isFinite));
}

/** A small KML reader for this file: SimpleData fields and Polygon rings per Placemark. */
function parseKml(kml: string): Ward[] {
  const wards: Ward[] = [];
  for (const [, body] of kml.matchAll(/<Placemark>([\s\S]*?)<\/Placemark>/g)) {
    const fields: Record<string, string> = {};
    for (const [, name, value] of body!.matchAll(/<SimpleData name="([^"]+)">([\s\S]*?)<\/SimpleData>/g)) fields[name!.trim()] = decode(value!);
    const polygons: number[][][][] = [];
    for (const [, poly] of body!.matchAll(/<Polygon>([\s\S]*?)<\/Polygon>/g)) {
      const outer = /<outerBoundaryIs>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/.exec(poly!)?.[1];
      if (!outer) continue;
      const inner = [...poly!.matchAll(/<innerBoundaryIs>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/g)].map((m) => ring(m[1]!));
      polygons.push([ring(outer), ...inner]);
    }
    if (polygons.length) wards.push({ fields, polygons });
  }
  return wards;
}

const int = (v: string | undefined) => (v && Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);

async function main() {
  const path = process.argv[2];
  const kml = path ? await readFile(path, "utf8") : await (await fetch(WARDS_KML_URL, { signal: AbortSignal.timeout(120_000) })).text();
  const wards = parseKml(kml);
  if (wards.length < 300) throw new Error(`Expected about 369 wards, found ${wards.length}`);
  console.log(`Parsed ${wards.length} wards from ${path ?? WARDS_SOURCE}`);

  const { error: clearError } = await db.rpc("clear_wards");
  if (clearError) throw new Error(`clear_wards failed: ${clearError.message}`);
  let loaded = 0;
  for (const w of wards) {
    const f = w.fields;
    const corporation = (f.Corporation ?? "").toLowerCase();
    const geojson = JSON.stringify({ type: "MultiPolygon", coordinates: w.polygons });
    const { data: id, error } = await db.rpc("insert_ward", { p_name: f.ward_name ?? f.Ward_Name ?? "Ward", p_corporation_id: corporation, p_geojson: geojson });
    if (error) throw new Error(`Ward ${f.Ward_Name}: ${error.message}`);
    const { error: e2 } = await db
      .from("wards")
      .update({
        ward_no: int(f.ward_id),
        name_kn: f.ward_name_kn ?? null,
        zone: f.zone ?? null,
        zone_name: f.zone_name ?? null,
        division: f.RO_Division?.replace(/^RO-\s*/, "") ?? null,
        subdivision: (f["ARO_ Sub Division"] ?? f.ARO_Sub_Division)?.replace(/^ARO-\s*/, "") ?? null,
        assembly_no: int(f.ac_no),
        assembly: f.ac ?? null,
        population: int(f.TOT_P),
      })
      .eq("id", id as number);
    if (e2) throw new Error(`Ward ${f.Ward_Name} facts: ${e2.message}`);
    loaded++;
  }
  console.log(`Loaded ${loaded} wards`);

  const { data: corps, error: e3 } = await db.rpc("corporation_boundaries_from_wards");
  if (e3) throw new Error(`Corporation boundaries: ${e3.message}`);
  const { data: backfilled, error: e4 } = await db.rpc("backfill_issue_areas");
  if (e4) throw new Error(`Backfill: ${e4.message}`);
  // Issues filed before the boundaries existed may carry a guessed corporation; the ward decides now.
  const { data: issues } = await db.from("issues").select("id, ward_id, agency").not("ward_id", "is", null);
  const { data: wardCorp } = await db.from("wards").select("id, corporation_id");
  const corpOf = new Map((wardCorp ?? []).map((w) => [w.id as number, w.corporation_id as string]));
  let fixed = 0;
  for (const i of issues ?? []) {
    if (i.agency !== "corporation") continue;
    const c = corpOf.get(i.ward_id as number);
    if (!c) continue;
    const { error } = await db.from("issues").update({ corporation_id: c }).eq("id", i.id).neq("corporation_id", c);
    if (!error) fixed++;
  }
  console.log(`Corporation boundaries: ${corps}; issues placed in a ward: ${backfilled}; corporation checked on ${fixed}`);

  // Contacts, officers and MLAs.
  for (const o of OFFICES) {
    const commissioner = OFFICERS.find((x) => x.corporationId === o.corporationId && x.role === "Commissioner");
    await db.from("corporations").update({ email: commissioner?.email ?? null }).eq("id", o.corporationId);
    const { error } = await db.from("corporation_offices").upsert({
      corporation_id: o.corporationId, address: o.address, phones: o.phones, helpline: o.helpline, website: o.website,
      budget_crore: o.budgetCrore, ward_grant_note: o.wardGrantNote, sources: o.sources, as_of: AS_OF,
    });
    if (error) throw new Error(`Office ${o.corporationId}: ${error.message}`);
  }
  await db.from("officers").delete().gte("id", 0);
  const { error: e5 } = await db.from("officers").insert(
    OFFICERS.map((x) => ({ corporation_id: x.corporationId, zone: x.zone, role: x.role, name: x.name, email: x.email, source: OFFICES.find((o) => o.corporationId === x.corporationId)!.website, as_of: AS_OF })),
  );
  if (e5) throw new Error(`Officers: ${e5.message}`);
  const { error: e6 } = await db.from("mlas").upsert(MLAS.map((m) => ({ assembly_no: m.assemblyNo, constituency: m.constituency, name: m.name, party: m.party, source: MLA_SOURCE, as_of: AS_OF })));
  if (e6) throw new Error(`MLAs: ${e6.message}`);
  console.log(`Loaded ${OFFICES.length} corporation offices, ${OFFICERS.length} officers and ${MLAS.length} MLAs`);
}

await main();
