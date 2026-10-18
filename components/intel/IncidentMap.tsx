"use client";

// A small 3D map of one incident: its ring and the problems inside it.
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { CityIncident, CityIssue } from "@/components/city/CityMap";

const CityMap = dynamic(() => import("@/components/city/CityMap"), { ssr: false, loading: () => <div className="skeleton h-full w-full" /> });

export function IncidentMap({ incident, issues }: { incident: CityIncident; issues: CityIssue[] }) {
  const router = useRouter();
  const zoom = incident.radiusM > 600 ? 14 : incident.radiusM > 250 ? 15 : 16;
  return (
    <div className="relative h-72 overflow-hidden rounded-card border border-white/8 md:h-80">
      <CityMap
        className="absolute inset-0"
        issues={issues}
        incidents={[incident]}
        layers={{ issues: true, incidents: true }}
        initialCamera={{ center: [incident.lng, incident.lat], zoom, pitch: 45, bearing: -10 }}
        onIssueClick={(id) => router.push(`/issue/${id}`)}
      />
    </div>
  );
}
