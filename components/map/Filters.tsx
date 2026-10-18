"use client";

import Link from "next/link";
import { House } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { CategoryChip } from "@/components/ui/CategoryChip";
import { CATEGORIES, STATUSES, type Status } from "@/lib/ai/schemas";
import type { IssueFilters } from "@/lib/issues";
import { CORPORATION_IDS, CORPORATION_NAMES, type CorporationId } from "@/lib/routing";

const STATUS_LABELS: Record<Status, string> = { open: "Open", fix_claimed: "Fix claimed", verified: "Verified" };

const selectClass =
  "shrink-0 rounded-full border border-white/6 bg-asphalt-700 px-3 py-1.5 text-sm font-medium text-chalk-50";

type FiltersProps = {
  value: IssueFilters;
  onChange: (value: IssueFilters) => void;
};

/** Glass filter bar over the map: status, corporation and category. */
export function Filters({ value, onChange }: FiltersProps) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto rounded-card border border-white/6 bg-asphalt-900/72 p-2 backdrop-blur-[16px] [scrollbar-width:none]">
      <Link href="/" aria-label="Home" className={buttonClasses("ghost", "shrink-0 px-2.5 py-1.5")}>
        <House size={18} strokeWidth={1.75} aria-hidden />
      </Link>
      <Link href="/report" className={buttonClasses("primary", "shrink-0 px-4 py-1.5")}>
        Report
      </Link>
      <select
        aria-label="Status"
        className={selectClass}
        value={value.status ?? ""}
        onChange={(e) => onChange({ ...value, status: (e.target.value || undefined) as Status | undefined })}
      >
        <option value="">Any status</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      <select
        aria-label="Corporation"
        className={selectClass}
        value={value.corporation ?? ""}
        onChange={(e) => onChange({ ...value, corporation: (e.target.value || undefined) as CorporationId | undefined })}
      >
        <option value="">All corporations</option>
        {CORPORATION_IDS.map((c) => (
          <option key={c} value={c}>
            {CORPORATION_NAMES[c]}
          </option>
        ))}
      </select>
      {CATEGORIES.map((c) => (
        <CategoryChip
          key={c}
          category={c}
          selected={value.category === c}
          className="shrink-0"
          onSelect={(picked) => onChange({ ...value, category: value.category === picked ? undefined : picked })}
        />
      ))}
    </div>
  );
}
