import { z } from "zod";
import { CATEGORIES, STATUSES, type Category, type Status } from "@/lib/ai/schemas";
import { CORPORATION_IDS } from "@/lib/routing";

/** Query of GET /api/issues. bbox is "minLng,minLat,maxLng,maxLat". */
export const issuesQuerySchema = z.object({
  bbox: z
    .string()
    .transform((s) => s.split(",").map(Number))
    .pipe(
      z.tuple([
        z.number().min(-180).max(180),
        z.number().min(-90).max(90),
        z.number().min(-180).max(180),
        z.number().min(-90).max(90),
      ]),
    ),
  status: z.enum(STATUSES).optional(),
  category: z.enum(CATEGORIES).optional(),
  corporation: z.enum(CORPORATION_IDS).optional(),
});

export type IssueFilters = {
  status?: Status;
  category?: Category;
  corporation?: (typeof CORPORATION_IDS)[number];
};

export type IssueProperties = {
  id: number;
  category: Category;
  severity: number;
  summary: string;
  status: Status;
  address: string | null;
  corporationId: string | null;
  backerCount: number;
  createdAt: string;
  photoUrl: string | null;
  verifiedAt: string | null;
  accessibility: "none" | "partial" | "major";
  /** 0..100 from lib/intel/priority.ts; null until computed. */
  priority: number | null;
  stage: string;
  incidentId: number | null;
  recurrenceOf: number | null;
  segmentKey: string | null;
};

export type IssueFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: IssueProperties;
};

export type IssueCollection = { type: "FeatureCollection"; features: IssueFeature[] };
