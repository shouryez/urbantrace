import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { CityIntel, type CityIntelData } from "@/components/dashboard/CityIntel";
import { Dashboard } from "@/components/dashboard/Dashboard";
import type { Category } from "@/lib/ai/schemas";
import { getDashboard } from "@/lib/dashboard";
import { NODE_LABELS, type CausalNode } from "@/lib/intel/causal";
import { rainImpact } from "@/lib/intel/rain";
import { listIncidents } from "@/lib/incidents-query";
import { CITY_BBOX, fetchIssues } from "@/lib/issues-query";
import { rainByDay } from "@/lib/weather";

export const metadata: Metadata = {
  title: "Dashboard · UrbanTrace",
};

const WATER = new Set<Category>(["waterlogging", "drainage", "water_leak_sewage", "pothole"]);

async function loadIntel(): Promise<CityIntelData> {
  const [rain, issues, incidents] = await Promise.all([
    rainByDay(60).catch(() => new Map<string, number>()),
    fetchIssues(CITY_BBOX, {}, 2000).catch(() => []),
    listIncidents().catch(() => []),
  ]);
  const water = issues.filter((f) => WATER.has(f.properties.category)).map((f) => f.properties.createdAt);
  const perDay = new Map<string, number>();
  for (const d of water) perDay.set(d.slice(0, 10), (perDay.get(d.slice(0, 10)) ?? 0) + 1);
  const priority = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of issues) {
    if (f.properties.status === "verified") continue;
    const p = f.properties.priority ?? 0;
    priority[p >= 70 ? "critical" : p >= 50 ? "high" : p >= 30 ? "medium" : "low"]++;
  }
  const causes = new Map<string, number>();
  for (const i of incidents) if (i.kind === "cluster" && i.rootCause) causes.set(i.rootCause, (causes.get(i.rootCause) ?? 0) + 1);
  return {
    rain: [...rain].sort(([a], [b]) => a.localeCompare(b)).map(([day, mm]) => ({ day, mm, reports: perDay.get(day) ?? 0 })),
    impact: rainImpact(water, rain, { label: "water and road reports" }),
    incidents: incidents.map((i) => ({ id: i.id, kind: i.kind, title: i.title, reportCount: i.reportCount, confidence: i.confidence })),
    rootCauses: [...causes].sort((a, b) => b[1] - a[1]).map(([c, count]) => ({ label: NODE_LABELS[c as CausalNode] ?? c, count })),
    priority,
  };
}

async function DashboardData() {
  await connection(); // live data: read at request time, not while prerendering
  const [data, intel] = await Promise.all([
    getDashboard().catch((err: unknown) => {
      console.error(err);
      return null;
    }),
    loadIntel(),
  ]);
  if (!data) return <p className="text-mist-300">The dashboard could not load right now. Try again in a moment.</p>;
  return (
    <>
      <Dashboard data={data} />
      <CityIntel data={intel} />
    </>
  );
}

export default function DashboardPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8 md:px-6">
      <header className="flex flex-col gap-2">
        <p className="kicker text-mist-300">Dashboard</p>
        <h1 className="font-display text-[32px] leading-tight font-semibold">How each corporation is doing</h1>
        <p className="max-w-2xl text-mist-300">
          Open, fix claimed and verified issues per city corporation, the median time from the first report to a verified fix, and what rain and
          incidents are doing to the city.
        </p>
      </header>
      <Suspense fallback={<div className="skeleton h-96 rounded-card" />}>
        <DashboardData />
      </Suspense>
    </main>
  );
}
