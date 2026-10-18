// Database tests against submit_report (Build Plan, Testing). They run on the Supabase project in
// .env.local, at a point outside the city so they never touch real issues, and delete what they
// create. Run: npm run test:db
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
const db = createClient(url, key, { auth: { persistSession: false } });

// A random spot in open country north of the city, so parallel or repeated runs do not collide.
const BASE = { lat: 13.6 + Math.random() * 0.2, lng: 77.0 + Math.random() * 0.2 };
const METRE_LAT = 1 / 111_320;
const north = (m: number) => ({ lat: BASE.lat + m * METRE_LAT, lng: BASE.lng });

const created = new Set<number>();

type Result = { out_issue_id: number; out_merged: boolean };

async function report(
  at: { lat: number; lng: number },
  opts: { category?: string; device?: string; forceNew?: boolean; target?: number | null } = {},
): Promise<Result> {
  const { data, error } = await db
    .rpc("submit_report", {
      p_category: opts.category ?? "pothole",
      p_severity: 3,
      p_summary: "Test report",
      p_lng: at.lng,
      p_lat: at.lat,
      p_photo_path: "reports/00000000-0000-4000-8000-000000000000.jpg",
      p_ai: { test: true },
      p_device: opts.device ?? crypto.randomUUID(),
      p_force_new: opts.forceNew ?? false,
      p_target_issue_id: opts.target ?? null,
    })
    .single<Result>();
  assert.ifError(error);
  assert.ok(data);
  created.add(data.out_issue_id);
  return data;
}

async function backers(id: number): Promise<number> {
  const { data } = await db.from("issues").select("backer_count").eq("id", id).single<{ backer_count: number }>();
  return data?.backer_count ?? -1;
}

after(async () => {
  for (const id of created) await db.from("issues").delete().eq("id", id); // reports and events cascade
});

describe("submit_report (F4 merge)", () => {
  test("same category 20 m apart merges and adds a backer", async () => {
    const first = await report(north(0));
    const second = await report(north(20));
    assert.equal(first.out_merged, false);
    assert.equal(second.out_merged, true);
    assert.equal(second.out_issue_id, first.out_issue_id);
    assert.equal(await backers(first.out_issue_id), 2);
  });

  test("40 m apart does not merge", async () => {
    const first = await report(north(200));
    const far = await report(north(240));
    assert.equal(far.out_merged, false);
    assert.notEqual(far.out_issue_id, first.out_issue_id);
  });

  test("a different category at the same spot does not merge", async () => {
    const first = await report(north(400));
    const other = await report(north(400), { category: "garbage" });
    assert.equal(other.out_merged, false);
    assert.notEqual(other.out_issue_id, first.out_issue_id);
  });

  test("the same device twice does not add a backer", async () => {
    const device = crypto.randomUUID();
    const first = await report(north(600), { device });
    const again = await report(north(605), { device });
    assert.equal(again.out_issue_id, first.out_issue_id);
    assert.equal(await backers(first.out_issue_id), 1);
  });

  test("a report next to a verified issue creates a new issue", async () => {
    const first = await report(north(800));
    await db.from("issues").update({ status: "verified", verified_at: new Date().toISOString() }).eq("id", first.out_issue_id);
    const next = await report(north(805));
    assert.equal(next.out_merged, false);
    assert.notEqual(next.out_issue_id, first.out_issue_id);
  });

  test('"No, it\'s different" (force new) creates a separate issue', async () => {
    const first = await report(north(1000));
    const forced = await report(north(1000), { forceNew: true });
    assert.equal(forced.out_merged, false);
    assert.notEqual(forced.out_issue_id, first.out_issue_id);
  });

  test("a confirmed target merges across categories (F12, I see this too)", async () => {
    const first = await report(north(1200));
    const backed = await report(north(1210), { category: "waterlogging", target: first.out_issue_id });
    assert.equal(backed.out_merged, true);
    assert.equal(backed.out_issue_id, first.out_issue_id);
    assert.equal(await backers(first.out_issue_id), 2);
  });

  test("merging raises severity to the highest report and logs the trail", async () => {
    const first = await report(north(1400));
    await db.rpc("submit_report", {
      p_category: "pothole", p_severity: 5, p_summary: "Worse", p_lng: north(1405).lng, p_lat: north(1405).lat,
      p_photo_path: "reports/00000000-0000-4000-8000-000000000000.jpg", p_ai: { test: true }, p_device: crypto.randomUUID(),
    });
    const { data: issue } = await db.from("issues").select("severity").eq("id", first.out_issue_id).single<{ severity: number }>();
    assert.equal(issue?.severity, 5);
    const { data: events } = await db.from("issue_events").select("kind").eq("issue_id", first.out_issue_id).order("id");
    assert.deepEqual(events?.map((e) => e.kind), ["reported", "merged"]);
  });
});
