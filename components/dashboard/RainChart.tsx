"use client";

import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type RainDay = { day: string; mm: number; reports: number };

/** Feature 15: daily rainfall (bars) against water and road reports (line). Loaded lazily by the dashboard. */
export default function RainChart({ days }: { days: RainDay[] }) {
  const rows = days.map((d) => ({ ...d, label: new Date(d.day).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={rows} margin={{ top: 8, right: 0, bottom: 0, left: -16 }}>
        <CartesianGrid stroke="#2B3038" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: "#A9B0B9", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#2B3038" }} minTickGap={24} />
        <YAxis yAxisId="mm" tick={{ fill: "#A9B0B9", fontSize: 11, fontFamily: "var(--font-jetbrains)" }} tickLine={false} axisLine={false} />
        <YAxis yAxisId="n" orientation="right" allowDecimals={false} tick={{ fill: "#A9B0B9", fontSize: 11, fontFamily: "var(--font-jetbrains)" }} tickLine={false} axisLine={false} />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          contentStyle={{ background: "#1D2127", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, color: "#F1F3F2" }}
          labelStyle={{ color: "#F1F3F2" }}
        />
        <Legend wrapperStyle={{ color: "#A9B0B9", fontSize: 12 }} />
        <Bar yAxisId="mm" dataKey="mm" name="Rain (mm)" fill="#4CC9F0" fillOpacity={0.55} maxBarSize={10} isAnimationActive={false} />
        <Line yAxisId="n" dataKey="reports" name="Water and road reports" stroke="#FF6A3D" strokeWidth={2} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
