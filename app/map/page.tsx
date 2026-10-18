import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { CityExplorer } from "@/components/city/CityExplorer";
import { listIncidents } from "@/lib/incidents-query";
import { CITY_BBOX, fetchIssues } from "@/lib/issues-query";

export const metadata: Metadata = {
  title: "Live map · UrbanTrace",
};

async function LiveCity() {
  await connection();
  const [issues, incidents] = await Promise.all([fetchIssues(CITY_BBOX, {}, 2000).catch(() => []), listIncidents().catch(() => [])]);
  return (
    <CityExplorer
      issues={issues.map((f) => ({
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
      }))}
      incidents={incidents.map((i) => ({ id: i.id, lng: i.lng, lat: i.lat, radiusM: i.radiusM, kind: i.kind, reportCount: i.reportCount, title: i.title }))}
    />
  );
}

export default function MapPage() {
  return (
    <main className="fixed inset-0 z-30">
      <Suspense fallback={<div className="h-full w-full bg-ink-950" />}>
        <LiveCity />
      </Suspense>
    </main>
  );
}
