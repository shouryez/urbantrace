import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, GitFork, Network, Siren } from "lucide-react";
import { ScenarioPanel } from "@/components/case/Interactive";
import { Section } from "@/components/case/Panels";
import { IssueCard } from "@/components/issue/IssueCard";
import { RootCauseGraph } from "@/components/intel/RootCauseGraph";
import { buttonClasses } from "@/components/ui/Button";
import { CATEGORY_LABELS, type Category } from "@/lib/ai/schemas";
import { NODE_LABELS, type CausalNode } from "@/lib/intel/causal";
import { getIncident } from "@/lib/incidents-query";

export const metadata: Metadata = { title: "Incident · UrbanTrace" };

async function IncidentView({ params }: { params: PageProps<"/incident/[id]">["params"] }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const found = await getIncident(id);
  if (!found) notFound();
  const { incident: i, issues } = found;
  const alert = i.kind === "alert";
  const cats = (Object.entries(i.categories) as [Category, number][]).sort((a, b) => b[1] - a[1]);
  const spanH = i.firstAt && i.lastAt ? (new Date(i.lastAt).getTime() - new Date(i.firstAt).getTime()) / 3_600_000 : null;

  return (
    <article className="flex flex-col gap-6">
      <header className={`flex flex-col gap-4 rounded-card border p-6 ${alert ? "border-siren/40 bg-siren/8" : "border-violet/30 bg-violet/6"}`}>
        <p className={`flex items-center gap-2 text-xs font-extrabold tracking-wide uppercase ${alert ? "text-siren" : "text-violet"}`}>
          {alert ? <Siren size={15} aria-hidden /> : <Network size={15} aria-hidden />}
          {alert ? "Civic alert" : "Possible civic incident"} · INC-{i.id} · {i.status}
        </p>
        <h1 className="font-display text-[34px] leading-tight font-bold">{i.title}</h1>
        {i.explanation && <p className="text-fog-200">{i.explanation}</p>}
        <div className="num grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
          {[
            [String(i.reportCount), "reports"],
            [`${Math.round(i.radiusM)} m`, "radius"],
            [spanH === null ? "–" : spanH < 48 ? `${Math.max(1, Math.round(spanH))} h` : `${Math.round(spanH / 24)} d`, "time span"],
            [`${Math.round(i.confidence * 100)}%`, "confidence"],
          ].map(([v, l]) => (
            <div key={l} className="rounded-xl bg-white/5 py-3">
              <p className="text-2xl font-semibold">{v}</p>
              <p className="font-sans text-xs text-fog-300">{l}</p>
            </div>
          ))}
        </div>
        {alert && i.graph?.areaKm2 !== undefined && (
          <p className="text-sm text-fog-200">
            {i.graph.locations} independent places within about {i.graph.areaKm2} km² in {i.graph.windowMinutes} minutes. The chance of this many reports at this area&apos;s normal rate is{" "}
            <span className="num">{(i.graph.pValue ?? 0).toExponential(1)}</span>.
          </p>
        )}
      </header>

      {i.graph && i.graph.nodes.length > 0 && (
        <Section title="Root cause graph" icon={<GitFork size={18} aria-hidden />} note={i.rootCause && <span className="text-xs text-violet">likely {NODE_LABELS[i.rootCause as CausalNode] ?? i.rootCause}</span>}>
          <RootCauseGraph graph={{ nodes: i.graph.nodes, edges: i.graph.edges }} />
          {i.graph.reasons && <p className="text-sm text-fog-300">{i.graph.reasons.join(" · ")}</p>}
          {i.graph.ranked && i.graph.ranked.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs text-fog-500">Other possible causes considered</p>
              {i.graph.ranked.slice(1, 4).map((r) => (
                <div key={r.cause} className="grid grid-cols-[180px_1fr] items-center gap-3 text-sm">
                  <span>{NODE_LABELS[r.cause as CausalNode] ?? r.cause}</span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-white/8">
                    <span className="block h-full origin-left rounded-full bg-violet/60" style={{ transform: `scaleX(${Math.min(1, r.score / Math.max(0.01, i.graph!.ranked![0]!.score))})` }} />
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-fog-500">An analytical signal from the civic causal graph and where and when the reports came in, not a confirmed diagnosis.</p>
        </Section>
      )}

      <Section title="Reported problems" icon={<Network size={18} aria-hidden />} note={<span className="num text-xs text-fog-300">{cats.map(([c, n]) => `${CATEGORY_LABELS[c]} ${n}`).join(" · ")}</span>}>
        {issues.length ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {issues.map((f) => (
              <li key={f.properties.id}>
                <Link href={`/issue/${f.properties.id}`} className="block rounded-card">
                  <IssueCard issue={f.properties} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fog-300">The issues of this incident have been resolved or regrouped.</p>
        )}
      </Section>

      {i.status === "active" && <ScenarioPanel endpoint={`/api/incidents/${i.id}/scenario`} initial={i.scenario} />}
    </article>
  );
}

export default function IncidentPage({ params }: PageProps<"/incident/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6">
      <Link href="/incidents" className={buttonClasses("ghost", "self-start px-0")}>
        <ArrowLeft size={16} aria-hidden /> All incidents
      </Link>
      <Suspense fallback={<div className="skeleton h-64 rounded-card" />}>
        <IncidentView params={params} />
      </Suspense>
    </main>
  );
}
