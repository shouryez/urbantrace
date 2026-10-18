"use client";

// The civic case the AI built (features 1, 7, 10, 11, 12): every problem found, its evidence,
// risks, accessibility, how long people say it has been there, the reporter's own language, and
// whether this spot was repaired before or belongs to an active incident.
import Link from "next/link";
import { AlertTriangle, History, Network } from "lucide-react";
import { CategoryChip } from "@/components/ui/CategoryChip";
import { CATEGORY_LABELS, type CaseReading } from "@/lib/ai/schemas";
import type { AnalyzeResult } from "@/lib/reports";

const ACCESS: Record<string, { label: string; tone: string }> = {
  none: { label: "No obstruction for people on foot", tone: "text-fog-300" },
  partial: { label: "Partial obstruction: a detour or care is needed", tone: "text-amber" },
  major: { label: "Major obstruction: the way is blocked or dangerous", tone: "text-siren" },
};

type Props = {
  result: AnalyzeResult;
  /** Which secondary problems to file as well (index into case.issues, 1 and up). */
  included: Set<number>;
  onToggle: (index: number) => void;
};

export function CaseDetected({ result, included, onToggle }: Props) {
  const c: CaseReading | null = result.case;
  return (
    <div className="flex flex-col gap-4 rounded-card border border-white/8 bg-ink-850 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="kicker text-fog-300">Civic case</p>
        <span className="num text-xs text-fog-500">
          {result.media === "video" ? `${result.frames.length} frames` : result.media === "voice" ? "voice" : "photo"}
          {result.language ? ` · ${result.language}` : ""}
        </span>
      </div>

      {result.recurrence && (
        <p className="flex items-start gap-2 rounded-xl border border-ember/40 bg-ember/10 p-3 text-sm">
          <History size={16} className="mt-0.5 shrink-0 text-ember" aria-hidden />
          <span>
            This spot was repaired on <span className="num">{result.recurrence.repairedOn}</span> ({result.recurrence.daysAgo} days ago) and the problem is
            back. It will be filed as a recurring issue.
          </span>
        </p>
      )}
      {result.incident && (
        <p className="flex items-start gap-2 rounded-xl border border-violet/40 bg-violet/10 p-3 text-sm">
          <Network size={16} className="mt-0.5 shrink-0 text-violet" aria-hidden />
          <span>
            Part of an active incident:{" "}
            <Link href={`/incident/${result.incident.id}`} className="font-bold underline-offset-4 hover:underline">
              {result.incident.title}
            </Link>{" "}
            ({result.incident.reportCount} reports nearby).
          </span>
        </p>
      )}

      {c && c.issues.length > 1 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-bold">Also found in your evidence</p>
          {c.issues.slice(1).map((p, j) => {
            const i = j + 1;
            return (
              <label key={i} className="flex cursor-pointer items-start gap-3 rounded-xl bg-white/4 p-3 text-sm">
                <input type="checkbox" checked={included.has(i)} onChange={() => onToggle(i)} className="mt-1 size-4 accent-signal" />
                <span className="flex flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <CategoryChip category={p.category} />
                    <span className="num text-xs text-fog-300">
                      severity {p.severity}/5 · {p.frames.length ? `frame ${p.frames.map((f) => f + 1).join(", ")}` : "from the voice note"}
                    </span>
                  </span>
                  <span className="text-fog-200">{p.summary}</span>
                </span>
              </label>
            );
          })}
          <p className="text-xs text-fog-500">Each ticked problem is filed as its own issue at this spot, linked to this case.</p>
        </div>
      )}

      {c && (
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-fog-500">Accessibility</dt>
            <dd className={ACCESS[c.accessibility]?.tone}>{ACCESS[c.accessibility]?.label}</dd>
          </div>
          {c.hazards.length > 0 && (
            <div>
              <dt className="text-xs text-fog-500">Risks</dt>
              <dd className="flex items-start gap-1.5">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-ember" aria-hidden />
                {c.hazards.join(" · ")}
              </dd>
            </div>
          )}
          {c.duration_claim && (
            <div>
              <dt className="text-xs text-fog-500">Been there for</dt>
              <dd>{c.duration_claim}</dd>
            </div>
          )}
          {c.location_hint && (
            <div>
              <dt className="text-xs text-fog-500">Place mentioned</dt>
              <dd>{c.location_hint}</dd>
            </div>
          )}
        </dl>
      )}

      {c?.summary_local && (
        <div className="rounded-xl bg-white/4 p-3">
          <p className="text-xs text-fog-500">In your language</p>
          <p className="mt-1 text-lg leading-relaxed">{c.summary_local}</p>
          <p className="mt-1 text-xs text-fog-500">The city receives it in English: {CATEGORY_LABELS[c.issues[0]!.category]}, {c.issues[0]!.summary}</p>
        </div>
      )}

      {result.transcript && (
        <details className="text-sm">
          <summary className="cursor-pointer text-fog-300">What you said</summary>
          <p className="mt-2 text-fog-200">{result.transcript}</p>
        </details>
      )}
    </div>
  );
}
