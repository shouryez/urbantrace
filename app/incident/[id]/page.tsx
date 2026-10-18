import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { GitFork, Network, Siren } from "lucide-react";
import { ScenarioPanel } from "@/components/case/Interactive";
import { Section } from "@/components/case/Panels";
import { IssueCard } from "@/components/issue/IssueCard";
import { CausePanel, FactorPanel, FixFirst, HowDetected, ReportTimeline } from "@/components/intel/IncidentExplain";
import { IncidentMap } from "@/components/intel/IncidentMap";
import { RootCauseGraph } from "@/components/intel/RootCauseGraph";
import { BackLink } from "@/components/ui/BackLink";
import { CATEGORY_LABELS, type Category } from "@/lib/ai/schemas";
import { CAUSE_ACTIONS, NODE_LABELS, type CausalNode } from "@/lib/intel/causal";
import { getIncident } from "@/lib/incidents-query";
import { recentRainMm } from "@/lib/weather";

export const metadata: Metadata = { title: "Incident · UrbanTrace" };

async function IncidentView({ params }: { params: PageProps<"/incident/[id]">["params"] }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [found, rain] = await Promise.all([getIncident(id), recentRainMm(3).catch(() => null)]);
  if (!found) notFound();
  const { incident: i, issues } = found;
  const alert = i.kind === "alert";
  const g = i.graph;
  const cats = (Object.entries(i.categories) as [Category, number][]).sort((a, b) => b[1] - a[1]);
  const spanH = i.firstAt && i.lastAt ? (new Date(i.lastAt).getTime() - new Date(i.firstAt).getTime()) / 3_600_000 : null;
  const ranked = g?.ranked ?? (i.rootCause ? [{ cause: i.rootCause, score: i.confidence }] : []);
  const cause = ranked[0]?.cause ?? i.rootCause;
  const clears = (g?.explains ?? []).filter((e) => e.direction !== "none" && e.strength >= 0.3).map((e) => CATEGORY_LABELS[e.category]);

  return (
    <article className="flex flex-col gap-6">
      <header className={`flex flex-col gap-4 rounded-card border p-6 ${alert ? "border-siren/40 bg-siren/8" : "border-violet/30 bg-violet/6"}`}>
        <p className={`flex items-center gap-2 text-xs font-extrabold tracking-wide uppercase ${alert ? "text-siren" : "text-violet"}`}>
          {alert ? <Siren size={15} aria-hidden /> : <Network size={15} aria-hidden />}
          {alert ? "Civic alert" : "Civic incident"} · INC-{i.id} · {i.status}
        </p>
        <h1 className="font-display text-[38px] leading-[1.05] font-bold tracking-tight md:text-[48px]">
          <span className="text-aurora">{i.title}</span>
        </h1>
        {i.explanation && <p className="max-w-3xl text-fog-200">{i.explanation}</p>}
        <div className="num grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
          {[
            [String(i.reportCount), "reports"],
            [String(i.issueCount), "problems"],
            [`${Math.round(i.radiusM)} m`, "radius"],
            [spanH === null ? "–" : spanH < 48 ? `${Math.max(1, Math.round(spanH))} h` : `${Math.round(spanH / 24)} d`, "time span"],
          ].map(([v, l]) => (
            <div key={l} className="rounded-xl bg-white/5 py-3">
              <p className="text-2xl font-semibold">{v}</p>
              <p className="font-sans text-xs text-fog-300">{l}</p>
            </div>
          ))}
        </div>
        {alert && g?.pValue !== undefined && (
          <p className="text-sm text-fog-200">
            {g.locations} different places within about {g.areaKm2} km² reported in {g.windowMinutes} minutes. This area normally gets about{" "}
            <span className="num">{g.baseline ?? "–"}</span> reports in 90 minutes; a burst this big would happen by chance with probability{" "}
            <span className="num">{(g.pValue ?? 0).toExponential(1)}</span>.
          </p>
        )}
        {alert && g?.relatedIncidentId && (
          <Link href={`/incident/${g.relatedIncidentId}`} className="self-start rounded-full border border-violet/40 px-3 py-1.5 text-xs font-bold text-violet hover:bg-violet/10">
            These reports belong to incident INC-{g.relatedIncidentId}: see its root cause →
          </Link>
        )}
      </header>

      {cause && <FixFirst cause={cause} probability={ranked[0]?.score ?? i.confidence} action={g?.action ?? CAUSE_ACTIONS[cause as CausalNode] ?? "Inspect the site."} clears={clears} />}

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-6">
          <IncidentMap
            incident={{ id: i.id, lat: i.lat, lng: i.lng, radiusM: i.radiusM, kind: i.kind, reportCount: i.reportCount, title: i.title }}
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
          />
          {!alert && g?.factors && <FactorPanel factors={g.factors} confidence={i.confidence} />}
          <ReportTimeline issues={issues.map((f) => ({ createdAt: f.properties.createdAt, backerCount: f.properties.backerCount }))} />
        </div>
        <div className="flex flex-col gap-6">
          {ranked.length > 0 && <CausePanel ranked={ranked} explains={g?.explains ?? []} rain={rain} />}
          {g && g.nodes.length > 0 && (
            <Section title="Root cause graph" icon={<GitFork size={18} aria-hidden />} note={i.rootCause && <span className="text-xs text-violet">likely {NODE_LABELS[i.rootCause as CausalNode] ?? i.rootCause}</span>}>
              <RootCauseGraph graph={{ nodes: g.nodes, edges: g.edges }} />
              <p className="text-xs text-fog-500">Arrows run from cause to effect; the number on a problem is how many reports it has.</p>
            </Section>
          )}
        </div>
      </div>

      <Section title="The reported problems" icon={<Network size={18} aria-hidden />} note={<span className="num text-xs text-fog-300">{cats.map(([c, n]) => `${CATEGORY_LABELS[c]} ${n}`).join(" · ")}</span>}>
        {issues.length ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {issues.map((f) => (
              <li key={f.properties.id}>
                <Link href={`/issue/${f.properties.id}`} className="block rounded-card">
                  <IssueCard issue={f.properties} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fog-300">The problems of this incident have been resolved or regrouped.</p>
        )}
      </Section>

      {i.status === "active" && <ScenarioPanel endpoint={`/api/incidents/${i.id}/scenario`} initial={i.scenario} />}
      <HowDetected alert={alert} />
    </article>
  );
}

export default function IncidentPage({ params }: PageProps<"/incident/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 md:px-6">
      <BackLink fallback="/incidents" label="Back" />
      <Suspense fallback={<div className="skeleton h-64 rounded-card" />}>
        <IncidentView params={params} />
      </Suspense>
    </main>
  );
}
