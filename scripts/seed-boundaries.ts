// Loads corporation and ward boundaries (F5, F10) from GeoJSON files, then fills in the
// corporation and ward of issues routed before the boundaries existed.
//
//   npm run seed:boundaries -- --corporations data/corporations.geojson --wards data/wards.geojson
//
// Both files are FeatureCollections of Polygon or MultiPolygon features in WGS 84 (EPSG:4326).
// Property names can be changed with flags:
//   --corp-id <prop>       corporation feature: one of west, east, north, south, central (default "corporation")
//   --ward-name <prop>     ward feature: its name (default "name")
//   --ward-corp <prop>     ward feature: its corporation id, as above (default "corporation")
// Loading wards replaces every ward already in the database. Needs migration 0006_boundaries.sql.
// The official source for these files is still to be confirmed (open task in the plan).

import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
const db = createClient(url, key, { auth: { persistSession: false } });

const CORPORATIONS = ["west", "east", "north", "south", "central"];

type Feature = { type: "Feature"; properties: Record<string, unknown> | null; geometry: { type: string } | null };

function flag(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

async function features(path: string): Promise<Feature[]> {
  const json = JSON.parse(await readFile(path, "utf8")) as { type?: string; features?: Feature[] };
  if (json.type !== "FeatureCollection" || !Array.isArray(json.features)) throw new Error(`${path} is not a GeoJSON FeatureCollection`);
  return json.features.filter((f) => f.geometry && ["Polygon", "MultiPolygon"].includes(f.geometry.type));
}

const text = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v).trim() : "");

async function main() {
  const corpFile = flag("corporations");
  const wardFile = flag("wards");
  if (!corpFile && !wardFile) throw new Error("Pass --corporations <file> and/or --wards <file>");

  if (corpFile) {
    const prop = flag("corp-id", "corporation")!;
    let loaded = 0;
    for (const f of await features(corpFile)) {
      const id = text(f.properties?.[prop]).toLowerCase();
      if (!CORPORATIONS.includes(id)) {
        console.warn(`Skipped a corporation feature: "${prop}" is "${id}", expected one of ${CORPORATIONS.join(", ")}`);
        continue;
      }
      const { error } = await db.rpc("set_corporation_boundary", { p_id: id, p_geojson: JSON.stringify(f.geometry) });
      if (error) throw new Error(`Corporation ${id} failed: ${error.message}`);
      loaded++;
    }
    console.log(`Loaded ${loaded} corporation boundaries.`);
  }

  if (wardFile) {
    const nameProp = flag("ward-name", "name")!;
    const corpProp = flag("ward-corp", "corporation")!;
    const wards = await features(wardFile);
    const { error: clearError } = await db.rpc("clear_wards");
    if (clearError) throw new Error(`Clearing wards failed: ${clearError.message}`);
    let loaded = 0;
    for (const f of wards) {
      const name = text(f.properties?.[nameProp]);
      const corp = text(f.properties?.[corpProp]).toLowerCase();
      if (!name) {
        console.warn("Skipped a ward feature without a name");
        continue;
      }
      const { error } = await db.rpc("insert_ward", {
        p_name: name,
        p_corporation_id: CORPORATIONS.includes(corp) ? corp : null,
        p_geojson: JSON.stringify(f.geometry),
      });
      if (error) throw new Error(`Ward ${name} failed: ${error.message}`);
      loaded++;
    }
    console.log(`Loaded ${loaded} wards.`);
  }

  const { data, error } = await db.rpc("backfill_issue_areas");
  if (error) throw new Error(`Backfill failed: ${error.message}`);
  console.log(`Filled in the ward of ${data as number} existing issues.`);
}

await main();
