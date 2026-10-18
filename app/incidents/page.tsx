import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Network, Siren } from "lucide-react";
import { CATEGORY_LABELS, type Category } from "@/lib/ai/schemas";
import { PageHeader } from "@/components/ui/PageHeader";
import { listIncidents, type Incident } from "@/lib/incidents-query";

export const metadata: Metadata = { title: "Incidents · UrbanTrace" };

function IncidentRow({ i }: { i: Incident }) {
  const alert = i.kind === "alert";
  const cats = (Object.entries(i.categories) as [Category, number][]).sort((a, b) => b[1] - a[1]);
  return (
    <li>
      <Link
        href={`/incident/${i.id}`}
        className={`flex flex-col gap-3 rounded-card border p-5 transition-transform hover:-translate-y-0.5 ${
          i.status === "resolved" ? "border-white/8 panel-fill opacity-70" : alert ? "border-siren/40 bg-siren/8" : "border-violet/30 bg-violet/6"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <span className={`flex items-center gap-2 text-xs font-extrabold tracking-wide uppercase ${alert ? "text-siren" : "text-violet"}`}>
            {alert ? <Siren size={14} aria-hidden /> : <Network size={14} aria-hidden />}
            {alert ? "Civic alert" : "Incident"} · {i.status}
          </span>
          <span className="num text-xs text-fog-300">INC-{i.id}</span>
        </div>
        <p className="font-display text-xl font-semibold">{i.title}</p>
        {i.explanation && <p className="line-clamp-2 text-sm text-fog-200">{i.explanation}</p>}
        <div className="num flex flex-wrap gap-x-5 gap-y-1 text-xs text-fog-300">
          <span>{i.reportCount} reports</span>
          <span>{i.issueCount} issues</span>
          <span>within {Math.round(i.radiusM)} m</span>
          <span>confidence {Math.round(i.confidence * 100)}%</span>
          {i.lastAt && <span>latest {new Date(i.lastAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>}
        </div>
        <p className="text-xs text-fog-500">{cats.map(([c, n]) => `${CATEGORY_LABELS[c]} ${n}`).join(" · ")}</p>
      </Link>
    </li>
  );
}

async function IncidentList() {
  await connection();
  const all = await listIncidents({ status: "all" }).catch(() => [] as Incident[]);
  const active = all.filter((i) => i.status === "active").sort((a, b) => Number(b.kind === "alert") - Number(a.kind === "alert") || b.reportCount - a.reportCount);
  const resolved = all.filter((i) => i.status === "resolved");
  return (
    <div className="flex flex-col gap-8">
      {active.length ? (
        <ul className="grid gap-4 md:grid-cols-2">{active.map((i) => <IncidentRow key={i.id} i={i} />)}</ul>
      ) : (
        <p className="rounded-card panel p-6 text-fog-300">
          No active incidents. When several related reports gather in one area, or reports burst far above an area&apos;s normal rate, they appear here.
        </p>
      )}
      {resolved.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl font-semibold">Resolved</h2>
          <ul className="grid gap-4 md:grid-cols-2">{resolved.slice(0, 20).map((i) => <IncidentRow key={i.id} i={i} />)}</ul>
        </section>
      )}
    </div>
  );
}

export default function IncidentsPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8 md:px-6">
      <PageHeader kicker="Incidents and alerts" title="Many reports, one" accent="root cause">
        Related reports that are close in space and time are grouped into one incident with its likely root cause. Sudden bursts of reports raise a
        civic alert.
      </PageHeader>
      <Suspense fallback={<div className="skeleton h-64 rounded-card" />}>
        <IncidentList />
      </Suspense>
    </main>
  );
}
