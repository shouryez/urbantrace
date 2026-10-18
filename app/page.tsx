import { connection } from "next/server";
import { Suspense } from "react";
import { HomeExperience, type HomeData } from "@/components/home/HomeExperience";
import { listIncidents } from "@/lib/incidents-query";
import { CITY_BBOX, fetchIssues, getCityStats } from "@/lib/issues-query";
import { recentRainMm } from "@/lib/weather";

async function loadHome(): Promise<HomeData> {
  await connection(); // live data: read at request time, not while prerendering
  const [issues, incidents, stats, rainMm] = await Promise.all([
    fetchIssues(CITY_BBOX, {}, 1500).catch(() => []),
    listIncidents().catch(() => []),
    getCityStats(),
    recentRainMm(3).catch(() => 0),
  ]);
  const featured = incidents.filter((i) => i.kind === "cluster" && i.graph?.nodes?.length).sort((a, b) => b.reportCount - a.reportCount)[0];
  return {
    issues: issues.map((f) => ({
      id: f.properties.id,
      lng: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
      status: f.properties.status,
      severity: f.properties.severity,
      priority: f.properties.priority,
      backerCount: f.properties.backerCount,
      accessibility: f.properties.accessibility,
      incidentId: f.properties.incidentId,
      createdAt: f.properties.createdAt,
    })),
    incidents: incidents.map((i) => ({ id: i.id, lng: i.lng, lat: i.lat, radiusM: i.radiusM, kind: i.kind, reportCount: i.reportCount, title: i.title })),
    stats: {
      issues: stats?.issues ?? 0,
      backers: stats?.backers ?? 0,
      verified: stats?.verified ?? 0,
      incidents: incidents.filter((i) => i.kind === "cluster").length,
    },
    rainMm,
    featured: featured?.graph
      ? { title: featured.title, reportCount: featured.reportCount, radiusM: featured.radiusM, confidence: featured.confidence, graph: { nodes: featured.graph.nodes, edges: featured.graph.edges } }
      : null,
  };
}

async function Home() {
  return <HomeExperience data={await loadHome()} />;
}

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-svh bg-ink-950" />}>
      <Home />
    </Suspense>
  );
}
