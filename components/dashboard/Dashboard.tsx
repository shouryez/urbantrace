"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { BackerCount } from "@/components/ui/BackerCount";
import type { CorporationStat, DashboardData, WardStat } from "@/lib/dashboard";

const CategoryChart = dynamic(() => import("./CategoryChart"), {
  ssr: false,
  loading: () => <div className="skeleton h-full w-full rounded-card" />,
});

const WardMap = dynamic(() => import("./WardMap"), {
  ssr: false,
  loading: () => <div className="skeleton h-full w-full rounded-card" />,
});

function hours(h: number | null): string {
  if (h === null) return "–";
  return h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} d`;
}

const COUNTS = [
  { key: "open", label: "Open", dot: "bg-alert-500" },
  { key: "fixClaimed", label: "Fix claimed", dot: "bg-marking-400" },
  { key: "verified", label: "Verified", dot: "bg-verified-500" },
] as const;

function Counts({ stat }: { stat: Pick<CorporationStat, "open" | "fixClaimed" | "verified"> }) {
  return (
    <dl className="flex flex-col gap-1.5 text-sm">
      {COUNTS.map(({ key, label, dot }) => (
        <div key={key} className="flex items-center justify-between gap-2">
          <dt className="flex items-center gap-2 text-mist-300">
            <span aria-hidden className={`size-2 rounded-full ${dot}`} />
            {label}
          </dt>
          <dd>
            <BackerCount value={stat[key]} fromZero />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * F10: corporation cards across the top, the ward map shaded by open issues (once ward boundaries are
 * loaded) and issues by category. Clicking a card or a ward filters the chart to it.
 */
export function Dashboard({ data }: { data: DashboardData }) {
  const [corporation, setCorporation] = useState<string | null>(null);
  const [wardId, setWardId] = useState<number | null>(null);
  const ward: WardStat | undefined = data.wards.find((w) => w.id === wardId);
  // A selected ward also highlights its corporation's card.
  const activeCorporation = ward ? ward.corporationId : corporation;

  const shown = ward
    ? data.wardCategories.filter((c) => c.wardId === ward.id)
    : corporation
      ? data.categories.filter((c) => c.corporationId === corporation)
      : data.categories;
  const scope = ward
    ? `Ward: ${ward.name}`
    : (data.corporations.find((c) => c.id === corporation)?.name ?? "All of Bengaluru, including BWSSB and BESCOM issues");

  const chart = (
    <section className="flex flex-col gap-4 rounded-card panel p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-[22px] font-semibold">Issues by category</h2>
        <p className="text-sm text-mist-300" aria-live="polite">
          {scope}
        </p>
      </div>
      <div className="h-96">
        <CategoryChart stats={shown} />
      </div>
    </section>
  );

  return (
    <div className="flex flex-col gap-8">
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {data.corporations.map((c) => {
          const active = c.id === activeCorporation;
          return (
            <li key={c.id}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setWardId(null);
                  setCorporation(active && !ward ? null : c.id);
                }}
                className={`flex h-full w-full flex-col gap-4 rounded-card border panel-fill p-4 text-left transition-transform duration-150 ease-out hover:-translate-y-1 ${
                  active ? "border-marking-400" : "border-white/6 hover:border-marking-400/30"
                }`}
              >
                <span className="font-display text-lg leading-tight font-semibold">{c.name.replace(" City Corporation", "")}</span>
                <Counts stat={c} />
                <p className="mt-auto flex items-baseline justify-between gap-2 border-t border-white/6 pt-3 text-xs text-mist-300">
                  Median time to fix <span className="font-mono text-base text-chalk-50">{hours(c.medianHoursToFix)}</span>
                </p>
              </button>
            </li>
          );
        })}
      </ul>

      {data.wards.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="flex flex-col gap-4 rounded-card panel p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-[22px] font-semibold">Open issues by ward</h2>
              {ward && (
                <button type="button" onClick={() => setWardId(null)} className="text-sm text-marking-400 underline-offset-4 hover:underline">
                  Clear ward
                </button>
              )}
            </div>
            <div className="h-96 overflow-hidden rounded-photo">
              <WardMap wards={data.wards} selectedId={wardId} onSelect={setWardId} />
            </div>
            {ward && (
              <div className="flex flex-col gap-2 rounded-[14px] border border-marking-400/30 bg-asphalt-700 p-4">
                <p className="font-medium">{ward.name}</p>
                <Counts stat={ward} />
                <p className="flex items-baseline justify-between text-xs text-mist-300">
                  Median time to fix <span className="font-mono text-base text-chalk-50">{hours(ward.medianHoursToFix)}</span>
                </p>
              </div>
            )}
          </section>
          {chart}
        </div>
      ) : (
        <>
          {chart}
          <p className="text-sm text-mist-300">
            The ward map shaded by open issues appears once ward boundaries are loaded. Until then the dashboard shows
            corporation level numbers only.
          </p>
        </>
      )}
    </div>
  );
}
