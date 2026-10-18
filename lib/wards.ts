// Server only: ward profiles — the ward's facts from the 2025 delimitation, who runs it (zone and
// corporation officers, as published), the area's MLA, the corporation's published contacts and budget,
// and the civic record of its issues. Needs migration 0008 and `npm run seed:wards`.
import type { Category } from "@/lib/ai/schemas";
import { CORPORATION_NAMES, isCorporationId } from "@/lib/routing";
import { supabaseAdmin } from "@/lib/supabase/server";

export type Officer = { role: string; name: string; email: string | null; zone: string | null };

export type WardSummary = {
  id: number;
  number: number | null;
  name: string;
  nameKn: string | null;
  corporationId: string;
  corporation: string;
  zone: string | null;
  zoneName: string | null;
  assembly: string | null;
  population: number | null;
  areaKm2: number | null;
  open: number;
  verified: number;
  recurring: number;
  accessibility: number;
};

export type WardProfile = WardSummary & {
  division: string | null;
  subdivision: string | null;
  assemblyNo: number | null;
  mla: { name: string; party: string | null; source: string | null } | null;
  /** The officers who answer for this ward: its zone first, then the corporation. */
  officers: Officer[];
  office: {
    address: string | null;
    phones: string[];
    helpline: string | null;
    website: string | null;
    budgetCrore: number | null;
    wardGrantNote: string | null;
    sources: string[];
    asOf: string | null;
  } | null;
  /** Where a complaint about this ward goes: the zone's Joint Commissioner, copied to the Commissioner. */
  contact: { to: string | null; cc: string[]; toName: string | null };
  categories: { category: Category; open: number }[];
  recent: { id: number; category: Category; summary: string; status: string; createdAt: string }[];
};

type WardRow = {
  id: number;
  ward_no: number | null;
  name: string;
  name_kn: string | null;
  corporation_id: string;
  zone: string | null;
  zone_name: string | null;
  division: string | null;
  subdivision: string | null;
  assembly_no: number | null;
  assembly: string | null;
  population: number | null;
  area_km2: number | null;
};

const WARD_COLUMNS = "id, ward_no, name, name_kn, corporation_id, zone, zone_name, division, subdivision, assembly_no, assembly, population, area_km2";

function summary(w: WardRow, counts: Map<number, { open: number; verified: number; recurring: number; accessibility: number }>): WardSummary {
  const c = counts.get(w.id) ?? { open: 0, verified: 0, recurring: 0, accessibility: 0 };
  return {
    id: w.id,
    number: w.ward_no,
    name: w.name,
    nameKn: w.name_kn,
    corporationId: w.corporation_id,
    corporation: isCorporationId(w.corporation_id) ? CORPORATION_NAMES[w.corporation_id] : w.corporation_id,
    zone: w.zone,
    zoneName: w.zone_name,
    assembly: w.assembly,
    population: w.population,
    areaKm2: w.area_km2,
    ...c,
  };
}

async function counts(): Promise<Map<number, { open: number; verified: number; recurring: number; accessibility: number }>> {
  const { data } = await supabaseAdmin().rpc("ward_issue_counts");
  return new Map(
    ((data ?? []) as { ward_id: number; open_count: number; verified_count: number; recurring_count: number; accessibility_count: number }[]).map((r) => [
      r.ward_id,
      { open: Number(r.open_count), verified: Number(r.verified_count), recurring: Number(r.recurring_count), accessibility: Number(r.accessibility_count) },
    ]),
  );
}

/** Every ward, for the ward directory. Empty until the wards are loaded. */
export async function listWards(): Promise<WardSummary[]> {
  const [{ data, error }, tally] = await Promise.all([supabaseAdmin().from("wards").select(WARD_COLUMNS).order("corporation_id").order("ward_no").limit(500), counts()]);
  if (error) {
    console.error("Listing wards failed:", error.message);
    return [];
  }
  return ((data ?? []) as WardRow[]).map((w) => summary(w, tally));
}

/** The full profile of one ward. */
export async function getWard(id: number): Promise<WardProfile | null> {
  const db = supabaseAdmin();
  const { data: row } = await db.from("wards").select(WARD_COLUMNS).eq("id", id).maybeSingle<WardRow>();
  if (!row) return null;
  const [tally, officers, office, mla, issues] = await Promise.all([
    counts(),
    db.from("officers").select("role, name, email, zone").eq("corporation_id", row.corporation_id).order("id"),
    db.from("corporation_offices").select("*").eq("corporation_id", row.corporation_id).maybeSingle(),
    row.assembly_no ? db.from("mlas").select("name, party, source").eq("assembly_no", row.assembly_no).maybeSingle() : Promise.resolve({ data: null }),
    db.from("issues").select("id, category, summary, status, created_at").eq("ward_id", id).order("created_at", { ascending: false }).limit(200),
  ]);
  const all = (officers.data ?? []) as Officer[];
  const mine = [...all.filter((o) => o.zone === row.zone), ...all.filter((o) => o.zone === null)];
  const jc = mine.find((o) => o.zone === row.zone && o.role === "Joint Commissioner" && o.email);
  const dc = mine.find((o) => o.zone === row.zone && o.role === "Deputy Commissioner" && o.email);
  const commissioner = mine.find((o) => o.zone === null && o.role === "Commissioner" && o.email);
  const to = jc ?? commissioner ?? null;
  const cc = [...new Set([dc?.email, commissioner?.email].filter((e): e is string => !!e && e !== to?.email))];

  const issueRows = (issues.data ?? []) as { id: number; category: Category; summary: string; status: string; created_at: string }[];
  const byCategory = new Map<Category, number>();
  for (const i of issueRows) if (i.status !== "verified") byCategory.set(i.category, (byCategory.get(i.category) ?? 0) + 1);
  const o = office.data as Record<string, unknown> | null;
  const m = mla.data as { name: string; party: string | null; source: string | null } | null;
  return {
    ...summary(row, tally),
    division: row.division,
    subdivision: row.subdivision,
    assemblyNo: row.assembly_no,
    mla: m,
    officers: mine,
    office: o
      ? {
          address: (o.address as string) ?? null,
          phones: (o.phones as string[]) ?? [],
          helpline: (o.helpline as string) ?? null,
          website: (o.website as string) ?? null,
          budgetCrore: o.budget_crore === null ? null : Number(o.budget_crore),
          wardGrantNote: (o.ward_grant_note as string) ?? null,
          sources: (o.sources as string[]) ?? [],
          asOf: (o.as_of as string) ?? null,
        }
      : null,
    contact: { to: to?.email ?? null, cc, toName: to ? `${to.role}, ${row.zone_name ?? ""} zone`.replace(", zone", "") : null },
    categories: [...byCategory].sort((a, b) => b[1] - a[1]).map(([category, open]) => ({ category, open })),
    recent: issueRows.slice(0, 12).map((i) => ({ id: i.id, category: i.category, summary: i.summary, status: i.status, createdAt: i.created_at })),
  };
}

/** The ward at a point, if the wards are loaded. */
export async function wardAt(lat: number, lng: number): Promise<number | null> {
  const { data } = await supabaseAdmin().rpc("locate_point", { p_lng: lng, p_lat: lat });
  return ((data as { ward_id: number | null }[] | null)?.[0]?.ward_id ?? null) as number | null;
}
