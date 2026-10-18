"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CATEGORY_META } from "@/components/ui/CategoryChip";
import { CATEGORIES, type Status } from "@/lib/ai/schemas";
import type { CategoryStat } from "@/lib/dashboard";

// Colour means status here too: orange open, yellow fix claimed, green verified.
const SERIES: { status: Status; label: string; colour: string }[] = [
  { status: "open", label: "Open", colour: "#E2512B" },
  { status: "fix_claimed", label: "Fix claimed", colour: "#F5B700" },
  { status: "verified", label: "Verified", colour: "#1E9E63" },
];

/** F10: issues by category, stacked by status. Loaded lazily by the dashboard. */
export default function CategoryChart({ stats }: { stats: Pick<CategoryStat, "category" | "status" | "count">[] }) {
  const rows = CATEGORIES.map((category) => {
    const row: Record<string, string | number> = { category: CATEGORY_META[category].label };
    for (const { status } of SERIES) {
      row[status] = stats.filter((s) => s.category === category && s.status === status).reduce((n, s) => n + s.count, 0);
    }
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
        <CartesianGrid stroke="#2B3038" vertical={false} />
        <XAxis
          dataKey="category"
          tick={{ fill: "#A9B0B9", fontSize: 12 }}
          tickLine={false}
          axisLine={{ stroke: "#2B3038" }}
          interval={0}
          angle={-35}
          textAnchor="end"
          height={96}
        />
        <YAxis allowDecimals={false} tick={{ fill: "#A9B0B9", fontSize: 12, fontFamily: "var(--font-jetbrains)" }} tickLine={false} axisLine={false} />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          contentStyle={{ background: "#1D2127", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, color: "#F1F3F2" }}
          labelStyle={{ color: "#F1F3F2" }}
        />
        {/* keep the status order: open, fix claimed, verified */}
        <Legend itemSorter={null} wrapperStyle={{ color: "#A9B0B9", fontSize: 12 }} />
        {SERIES.map((s) => (
          // No grow animation: it animates bar height, and only transform and opacity may animate.
          <Bar key={s.status} dataKey={s.status} name={s.label} stackId="status" fill={s.colour} maxBarSize={40} isAnimationActive={false} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
