"use client";

// Civic impact (feature 20): what this phone's reports have done. No points, badges or leaderboard;
// just the civic outcomes. The device id stays in this browser.
import Link from "next/link";
import { useEffect, useState } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { getDeviceId } from "@/lib/device";
import type { Impact } from "@/lib/intel-server/place";

export function ImpactView() {
  const [impact, setImpact] = useState<Impact | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch(`/api/impact?device=${getDeviceId()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("impact"))))
      .then((d: Impact) => setImpact(d))
      .catch(() => setFailed(true));
  }, []);

  if (failed) return <p className="text-fog-300">Your impact could not load right now.</p>;
  if (!impact) return <div className="skeleton h-64 rounded-card" />;
  if (!impact.reports) {
    return (
      <div className="flex flex-col items-start gap-4 rounded-card panel p-6">
        <p className="text-fog-200">You have not reported anything from this phone yet.</p>
        <Link href="/report" className={buttonClasses("primary")}>
          Report your first issue
        </Link>
      </div>
    );
  }

  const tiles: [number, string, string][] = [
    [impact.verifiedIssues, "verified fixes", "text-mint"],
    [impact.issuesBacked, "issues you reported or backed", "text-fog-50"],
    [impact.accessibilityHazards, "accessibility hazards reported", "text-cyan"],
    [impact.recurringSurfaced, "recurring problems surfaced", "text-ember"],
  ];
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map(([n, label, tone]) => (
          <div key={label} className="rounded-card panel p-5">
            <p className={`num text-4xl font-semibold ${tone}`}>{n}</p>
            <p className="mt-2 text-sm text-fog-300">{label}</p>
          </div>
        ))}
      </div>
      <div className="rounded-card border border-violet/30 bg-violet/6 p-6">
        <p className="kicker text-violet">Community impact</p>
        <p className="mt-3 text-lg">
          <span className="num font-semibold">{impact.mergedInto}</span> of your issues were backed by other people, and they belong to{" "}
          <span className="num font-semibold">{impact.incidents}</span> incident{impact.incidents === 1 ? "" : "s"} the city can fix at the root.
        </p>
        <p className="mt-2 text-sm text-fog-300">
          {impact.reports} report{impact.reports === 1 ? "" : "s"} since {impact.firstReportAt ? new Date(impact.firstReportAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "today"}.
        </p>
      </div>
    </div>
  );
}
