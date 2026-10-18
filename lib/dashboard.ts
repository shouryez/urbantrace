// Server only: F10 numbers from the dashboard views in 0005_stretch.sql.
import type { Category, Status } from "@/lib/ai/schemas";
import { supabaseAdmin } from "@/lib/supabase/server";

export type CorporationStat = {
  id: string;
  name: string;
  open: number;
  fixClaimed: number;
  verified: number;
  /** Median hours from report to verified fix; null until something is verified. */
  medianHoursToFix: number | null;
};

export type CategoryStat = { corporationId: string | null; category: Category; status: Status; count: number };

/** F10: a ward with its counts and outline (GeoJSON geometry), for the shaded ward map. */
export type WardStat = Omit<CorporationStat, "id"> & { id: number; corporationId: string | null; geometry: GeoJSON.Geometry };

export type WardCategoryStat = { wardId: number; category: Category; status: Status; count: number };

export type DashboardData = {
  corporations: CorporationStat[];
  categories: CategoryStat[];
  /** Empty until ward boundaries are loaded (scripts/seed-boundaries.ts). */
  wards: WardStat[];
  wardCategories: WardCategoryStat[];
};

type CorporationRow = {
  id: string;
  name: string;
  open_count: number;
  fix_claimed_count: number;
  verified_count: number;
  median_hours_to_fix: number | null;
};

type CategoryRow = { corporation_id: string | null; category: Category; status: Status; issue_count: number };

type WardRow = Omit<CorporationRow, "id"> & { id: number; corporation_id: string | null; geojson: GeoJSON.Geometry };

type WardCategoryRow = { ward_id: number; category: Category; status: Status; issue_count: number };

const counts = (r: Omit<CorporationRow, "id" | "name">) => ({
  open: Number(r.open_count),
  fixClaimed: Number(r.fix_claimed_count),
  verified: Number(r.verified_count),
  medianHoursToFix: r.median_hours_to_fix === null ? null : Number(r.median_hours_to_fix),
});

/** Throws on a database error. */
export async function getDashboard(): Promise<DashboardData> {
  const db = supabaseAdmin();
  const [corporations, categories, wards, wardCategories] = await Promise.all([
    db.from("corporation_stats").select("*").order("id"),
    db.from("category_stats").select("*"),
    // Missing until migration 0006 runs; the dashboard then shows corporation level only.
    db.rpc("ward_shapes"),
    db.from("ward_category_stats").select("*"),
  ]);
  if (corporations.error) throw new Error(`corporation_stats failed: ${corporations.error.message}`);
  if (categories.error) throw new Error(`category_stats failed: ${categories.error.message}`);

  return {
    corporations: (corporations.data as CorporationRow[]).map((r) => ({ id: r.id, name: r.name, ...counts(r) })),
    categories: (categories.data as CategoryRow[]).map((r) => ({
      corporationId: r.corporation_id,
      category: r.category,
      status: r.status,
      count: Number(r.issue_count),
    })),
    wards: ((wards.error ? [] : wards.data) as WardRow[]).map((r) => ({
      id: r.id,
      name: r.name,
      corporationId: r.corporation_id,
      geometry: r.geojson,
      ...counts(r),
    })),
    wardCategories: ((wardCategories.error ? [] : wardCategories.data) as WardCategoryRow[]).map((r) => ({
      wardId: r.ward_id,
      category: r.category,
      status: r.status,
      count: Number(r.issue_count),
    })),
  };
}
