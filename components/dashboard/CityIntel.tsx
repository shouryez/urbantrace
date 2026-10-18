"use client";

// Dashboard intelligence: rain and civic reports (feature 15), incidents and alerts (2, 3, 16) and the
// priority mix of open cases (9).
import dynamic from "next/dynamic";
import Link from "next/link";
import { CloudRain, Network, Siren } from "lucide-react";
import type { RainImpact } from "@/lib/intel/rain";
import type { RainDay } from "./RainChart";

const RainChart = dynamic(() => import("./RainChart"), { ssr: false, loading: () => <div className="skeleton h-full w-full rounded-card" /> });

export type CityIntelData = {
  rain: RainDay[];
  impact: RainImpact;
  incidents: { id: number; kind: "cluster" | "alert"; title: string; reportCount: number; confidence: number }[];
  rootCauses: { label: string; count: number }[];
  priority: { critical: number; high: number; medium: number; low: number };
};

const BANDS = [
  ["critical", "Critical", "bg-siren"],
  ["high", "High", "bg-ember"],
  ["medium", "Medium", "bg-amber"],
  ["low", "Low", "bg-fog-500"],
] as const;

export function CityIntel({ data }: { data: CityIntelData }) {
  const totalRain = Math.round(data.rain.reduce((s, d) => s + d.mm, 0));
  const open = BANDS.reduce((s, [k]) => s + data.priority[k], 0);
  const alerts = data.incidents.filter((i) => i.kind === "alert");
  const clusters = data.incidents.filter((i) => i.kind === "cluster");
  return (
    <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
      <section className="flex flex-col gap-4 rounded-card border border-white/6 bg-ink-850 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-[22px] font-semibold">
            <CloudRain size={20} className="text-cyan" aria-hidden /> Rain and civic reports
          </h2>
          <p className="num text-sm text-fog-300">{totalRain} mm in {data.rain.length} days</p>
        </div>
        <div className="h-64">
          <RainChart days={data.rain} />
        </div>
        <p className="text-sm text-fog-200">{data.impact.summary}</p>
        <dl className="num grid grid-cols-3 gap-2 text-center">
          {[
            [String(data.impact.heavyRainDays), "heavy rain days"],
            [data.impact.ratio === null ? "–" : `${data.impact.ratio.toFixed(1)}×`, "reports after vs before"],
            [data.impact.correlation === null ? "–" : data.impact.correlation.toFixed(2), "rain → next day r"],
          ].map(([v, l]) => (
            <div key={l} className="rounded-xl bg-white/5 py-2">
              <dd className="text-xl font-semibold">{v}</dd>
              <dt className="font-sans text-[11px] text-fog-300">{l}</dt>
            </div>
          ))}
        </dl>
        <p className="text-[11px] text-fog-500">Weather data by Open-Meteo.com (CC BY 4.0). A correlation, not proof of cause.</p>
      </section>

      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-3 rounded-card border border-white/6 bg-ink-850 p-5">
          <h2 className="font-display text-[22px] font-semibold">Open cases by priority</h2>
          <div className="flex h-3 overflow-hidden rounded-full bg-white/6" aria-hidden>
            {BANDS.map(([k, , c]) => (
              <span key={k} className={c} style={{ width: `${open ? (data.priority[k] / open) * 100 : 0}%` }} />
            ))}
          </div>
          <dl className="grid grid-cols-4 gap-2 text-center">
            {BANDS.map(([k, label]) => (
              <div key={k}>
                <dd className="num text-xl font-semibold">{data.priority[k]}</dd>
                <dt className="text-[11px] text-fog-300">{label}</dt>
              </div>
            ))}
          </dl>
        </section>

        <section className="flex flex-col gap-3 rounded-card border border-white/6 bg-ink-850 p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-[22px] font-semibold">Incidents</h2>
            <Link href="/incidents" className="text-sm text-signal underline-offset-4 hover:underline">
              All incidents
            </Link>
          </div>
          <p className="num text-sm text-fog-300">
            <span className="text-violet">{clusters.length}</span> active incidents · <span className="text-siren">{alerts.length}</span> alerts
          </p>
          <ul className="flex flex-col gap-2">
            {data.incidents.slice(0, 4).map((i) => (
              <li key={i.id}>
                <Link href={`/incident/${i.id}`} className="flex items-center gap-2 rounded-xl bg-white/4 px-3 py-2 text-sm hover:bg-white/8">
                  {i.kind === "alert" ? <Siren size={14} className="text-siren" aria-hidden /> : <Network size={14} className="text-violet" aria-hidden />}
                  <span className="min-w-0 flex-1 truncate">{i.title}</span>
                  <span className="num text-xs text-fog-300">{i.reportCount}</span>
                </Link>
              </li>
            ))}
          </ul>
          {data.rootCauses.length > 0 && (
            <p className="text-xs text-fog-300">Likely root causes: {data.rootCauses.map((r) => `${r.label} (${r.count})`).join(", ")}</p>
          )}
        </section>
      </div>
    </div>
  );
}
