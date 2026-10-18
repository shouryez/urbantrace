// Explaining an incident in plain words: why the reports are one incident (weighted factors), what is
// most likely causing it (posterior probabilities, and the chain to each problem), what to fix first,
// when the reports came in, and how the detection works.
import { ArrowRight, CircleHelp, Hammer, Scale, Sparkles, TimerReset } from "lucide-react";
import { CATEGORY_LABELS, type Category } from "@/lib/ai/schemas";
import { NODE_LABELS, type CausalNode, type RootCauseResult } from "@/lib/intel/causal";
import type { IncidentFactor } from "@/lib/intel/incidents";
import { Section } from "@/components/case/Panels";

const pct = (v: number) => `${Math.round(v * 100)}%`;
const label = (c: string) => NODE_LABELS[c as CausalNode] ?? c;

/** The headline answer: the likely cause, how sure, and the one thing to fix. */
export function FixFirst({ cause, probability, action, clears }: { cause: string; probability: number; action: string; clears: string[] }) {
  return (
    <section className="grid gap-4 rounded-card border border-violet/40 bg-violet/10 p-5 md:grid-cols-[auto_1fr] md:items-center">
      <span aria-hidden className="flex size-12 items-center justify-center rounded-2xl bg-violet text-ink-950">
        <Hammer size={22} />
      </span>
      <div className="flex flex-col gap-1.5">
        <p className="kicker text-violet">Fix this first</p>
        <p className="font-display text-xl font-semibold">
          {label(cause)} <span className="num text-base font-normal text-fog-200">· {pct(probability)} likely</span>
        </p>
        <p className="text-sm text-fog-100">{action}</p>
        {clears.length > 0 && <p className="text-xs text-fog-300">Should also clear: {clears.join(", ")}</p>}
      </div>
    </section>
  );
}

export function FactorPanel({ factors, confidence }: { factors: IncidentFactor[]; confidence: number }) {
  return (
    <Section title="Why we think this is one incident" icon={<Scale size={18} aria-hidden />} note={<span className="num rounded-full bg-violet px-3 py-1 text-xs font-extrabold text-ink-950">{pct(confidence)} confident</span>}>
      <ul className="flex flex-col gap-3">
        {factors.map((f) => (
          <li key={f.key} className="grid gap-1.5 sm:grid-cols-[190px_1fr_auto] sm:items-center sm:gap-3">
            <span className="text-sm font-semibold">{f.label}</span>
            <span className="h-2 overflow-hidden rounded-full bg-white/8">
              <span className="block h-full origin-left rounded-full bg-violet" style={{ transform: `scaleX(${f.value})` }} />
            </span>
            <span className="num text-xs text-fog-300">
              {pct(f.value)} × {Math.round(f.weight * 100)}
            </span>
            <span className="text-xs text-fog-300 sm:col-span-3 sm:-mt-1">{f.detail}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-fog-500">Confidence is the weighted sum: each factor (0 to 100%) times its weight, with weights adding up to 100.</p>
    </Section>
  );
}

export function CausePanel({ ranked, explains, rain }: { ranked: { cause: string; score: number }[]; explains: RootCauseResult["explains"]; rain: number | null }) {
  const top = ranked[0];
  return (
    <Section title="What is most likely causing it" icon={<Sparkles size={18} aria-hidden />}>
      <ul className="flex flex-col gap-2">
        {ranked.slice(0, 5).map((r, i) => (
          <li key={r.cause} className="grid grid-cols-[150px_1fr_44px] items-center gap-3 text-sm sm:grid-cols-[190px_1fr_48px]">
            <span className={i === 0 ? "font-semibold" : "text-fog-200"}>{label(r.cause)}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-white/8">
              <span className={`block h-full origin-left rounded-full ${i === 0 ? "bg-violet" : "bg-violet/40"}`} style={{ transform: `scaleX(${Math.max(0.02, r.score)})` }} />
            </span>
            <span className="num text-right text-xs">{pct(r.score)}</span>
          </li>
        ))}
      </ul>
      {top && explains.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl bg-white/4 p-4">
          <p className="text-xs text-fog-500">How {label(top.cause).toLowerCase()} accounts for each reported problem</p>
          <ul className="flex flex-col gap-2">
            {explains.map((e) => (
              <li key={e.category} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="font-semibold">{CATEGORY_LABELS[e.category as Category]}</span>
                <span className="num text-xs text-fog-500">{e.reports} reports</span>
                {e.direction === "none" ? (
                  <span className="text-xs text-fog-300">not explained by this cause</span>
                ) : (
                  <span className="flex flex-wrap items-center gap-1 text-xs text-fog-200">
                    {e.direction === "feeds" ? "feeds the cause:" : "caused through:"}
                    {e.via.map((n, i) => (
                      <span key={`${n}-${i}`} className="flex items-center gap-1">
                        {i > 0 && <ArrowRight size={11} className="text-fog-500" aria-hidden />}
                        <span className="rounded-md bg-white/6 px-1.5 py-0.5">{label(n)}</span>
                      </span>
                    ))}
                    <span className="num text-fog-500">link {Math.round(e.strength * 100)}%</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-fog-500">
        Probabilities from a small Bayesian model over the civic causal graph: how well each cause explains every problem here, times how common that cause
        is{rain !== null ? `; ${Math.round(rain)} mm of recent rain raises rainfall as a cause` : ""}. An analytical signal, not a confirmed diagnosis.
      </p>
    </Section>
  );
}

/** Reports per day from the member issues, with the alert window or cluster span marked. */
export function ReportTimeline({ issues }: { issues: { createdAt: string; backerCount: number }[] }) {
  if (!issues.length) return null;
  const days = new Map<string, number>();
  for (const i of issues) days.set(i.createdAt.slice(0, 10), (days.get(i.createdAt.slice(0, 10)) ?? 0) + i.backerCount);
  const keys = [...days.keys()].sort();
  const first = new Date(keys[0]!).getTime();
  const last = new Date(keys.at(-1)!).getTime();
  const span = Math.max(1, Math.round((last - first) / 86_400_000) + 1);
  const all = Array.from({ length: Math.min(span, 60) }, (_, i) => new Date(last - (Math.min(span, 60) - 1 - i) * 86_400_000).toISOString().slice(0, 10));
  const max = Math.max(...days.values());
  return (
    <Section title="When the reports came in" icon={<TimerReset size={18} aria-hidden />} note={<span className="num text-xs text-fog-300">{span} day{span > 1 ? "s" : ""}</span>}>
      <div className="flex h-24 items-end gap-[3px]" role="img" aria-label={`Reports per day over ${span} days, at most ${max} in a day`}>
        {all.map((d) => (
          <span key={d} title={`${d}: ${days.get(d) ?? 0} reports`} className="flex-1 origin-bottom rounded-t bg-violet/70" style={{ height: "100%", transform: `scaleY(${Math.max(0.03, (days.get(d) ?? 0) / max)})` }} />
        ))}
      </div>
      <div className="num flex justify-between text-[11px] text-fog-500">
        <span>{all[0]}</span>
        <span>{all.at(-1)}</span>
      </div>
    </Section>
  );
}

export function HowDetected({ alert }: { alert: boolean }) {
  return (
    <details className="group rounded-card panel p-5">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-display text-[18px] font-semibold">
        <CircleHelp size={18} aria-hidden /> How UrbanTrace finds {alert ? "alerts" : "incidents"}
      </summary>
      <ol className="mt-4 flex list-decimal flex-col gap-2 pl-5 text-sm text-fog-200">
        {alert ? (
          <>
            <li>Every report in the last 90 minutes is grouped with others within 1 km.</li>
            <li>We count how many reports that area normally gets in 90 minutes, from its last 30 days.</li>
            <li>If the burst is so large that it would happen by chance less than once in a thousand times (a Poisson test), it becomes an alert.</li>
            <li>It needs at least 6 reports from 4 different places, so one person cannot raise it. Alerts expire 24 hours after the last report.</li>
          </>
        ) : (
          <>
            <li>Two open problems are linked when they are close (300 m, or up to 650 m for drainage), close in time (10 days for water problems, 30 for road damage), and plausibly share a cause in the civic causal graph.</li>
            <li>Linked problems grow into a cluster, the way water spreads (density based clustering); a cluster needs at least 4 reports.</li>
            <li>For the cluster, every possible cause is scored by how well it explains each problem, times how common it is, and the scores are turned into probabilities.</li>
            <li>The incident closes by itself when its problems are fixed or no longer hold together.</li>
          </>
        )}
      </ol>
    </details>
  );
}
