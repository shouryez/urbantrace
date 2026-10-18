// Case file panels for the issue page: priority (feature 9), crowd evidence (5), assignment (8),
// journey (18), case file (17) and evidence media (1, 11, 12). Server components.
import Image from "next/image";
import { BadgeCheck, ChevronRight, Circle, CircleDot, FileText, HardHat, Mic, Scale, ShieldCheck, Video } from "lucide-react";
import type { ReactNode } from "react";
import type { CaseFile } from "@/lib/ai/schemas";
import { CATEGORY_LABELS } from "@/lib/ai/schemas";
import { PHOTO_BLUR } from "@/lib/blur";
import type { Assignment } from "@/lib/intel/assignment";
import type { EvidenceResult } from "@/lib/intel/evidence";
import type { JourneyStep } from "@/lib/intel/journey";
import type { CaseReport, IssueDetail } from "@/lib/issue-detail";

export function Section({ title, icon, children, note }: { title: string; icon: ReactNode; children: ReactNode; note?: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-card panel p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-[20px] font-semibold">
          {icon}
          {title}
        </h2>
        {note}
      </div>
      {children}
    </section>
  );
}

const BAND: Record<string, string> = { critical: "bg-siren text-ink-950", high: "bg-ember text-ink-950", medium: "bg-amber text-ink-950", low: "bg-ink-600 text-fog-50" };

export function PriorityPanel({ priority }: { priority: NonNullable<IssueDetail["priority"]> }) {
  return (
    <Section
      title="Priority signal"
      icon={<Scale size={18} aria-hidden />}
      note={
        <span className={`rounded-full px-3 py-1 text-xs font-extrabold uppercase ${BAND[priority.band]}`}>
          {priority.band} · <span className="num">{priority.score}</span>
        </span>
      }
    >
      <ul className="flex flex-col gap-2.5">
        {priority.factors.map((f) => (
          <li key={f.key} className="grid grid-cols-[140px_1fr_44px] items-center gap-3 text-sm">
            <span className="text-fog-200">{f.label}</span>
            <span className="h-2 overflow-hidden rounded-full bg-white/8">
              <span className="block h-full origin-left rounded-full bg-[linear-gradient(90deg,#ff6a3d,#ffb547)]" style={{ transform: `scaleX(${f.value})` }} />
            </span>
            <span className="num text-right text-xs text-fog-300">{Math.round(f.contribution * 100)}</span>
          </li>
        ))}
      </ul>
      <p className="text-sm">
        <span className="text-fog-300">Why: </span>
        {priority.reason}
      </p>
      <p className="text-xs text-fog-500">Each bar is a factor from 0 to 1; the number is its weighted share of the score out of 100. Upvotes alone never decide it.</p>
    </Section>
  );
}

const LEVEL: Record<string, string> = { "very high": "text-mint", high: "text-mint", medium: "text-amber", low: "text-fog-300" };

export function EvidencePanel({ evidence }: { evidence: EvidenceResult }) {
  const rows = [
    ["Severity", evidence.severity, `estimate ${evidence.severity.estimate}/5`],
    ["Location", evidence.location, null],
    ["Recurrence", evidence.recurrence, null],
    ["Duration", evidence.duration, `about ${evidence.duration.estimateDays} days`],
    ["Cause", evidence.cause, null],
  ] as const;
  return (
    <Section
      title="Crowd truth"
      icon={<ShieldCheck size={18} aria-hidden />}
      note={<span className="num text-xs text-fog-300">overall {Math.round(evidence.overall * 100)}%</span>}
    >
      <dl className="flex flex-col gap-3">
        {rows.map(([label, d, extra]) => (
          <div key={label} className="grid grid-cols-[110px_1fr] gap-3 text-sm">
            <dt className="text-fog-300">{label}</dt>
            <dd>
              <span className={`font-extrabold uppercase ${LEVEL[d.level]}`}>{d.level}</span>
              <span className="text-fog-300"> · {d.detail}</span>
              {extra && <span className="num text-xs text-fog-500"> · {extra}</span>}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-fog-500">
        From the model&apos;s reading, {evidence.independentReports} independent reporter{evidence.independentReports === 1 ? "" : "s"} ({evidence.media.video} video,{" "}
        {evidence.media.photo} photo, {evidence.media.voice} voice) and the repair history.
      </p>
    </Section>
  );
}

export function AssignmentPanel({ assignment }: { assignment: Assignment }) {
  const rows: [string, string][] = [
    ["Department", assignment.department],
    ["Sub-department", assignment.subDepartment],
    ["Work type", assignment.workType],
    ["Crew", `${assignment.crew} worker${assignment.crew > 1 ? "s" : ""}`],
    ["Equipment", assignment.equipment.join(", ") || "none"],
    ["Estimated work", `about ${assignment.estimatedHours} hours`],
    ["Urgency", assignment.urgency],
  ];
  return (
    <Section title="Assignment" icon={<HardHat size={18} aria-hidden />}>
      <dl className="grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-b border-white/6 pb-2">
            <dt className="text-fog-300">{k}</dt>
            <dd className="text-right font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-fog-500">{assignment.note}</p>
    </Section>
  );
}

export function JourneyPanel({ steps }: { steps: JourneyStep[] }) {
  return (
    <Section title="Where does this complaint go?" icon={<ChevronRight size={18} aria-hidden />}>
      <ol className="flex flex-col">
        {steps.map((s, i) => (
          <li key={s.key} className="relative flex gap-3 pb-4 last:pb-0">
            {i < steps.length - 1 && <span aria-hidden className={`absolute top-6 left-[11px] h-full border-l-2 ${s.state === "done" ? "border-mint" : "border-dotted border-white/15"}`} />}
            <span className="relative z-10 mt-0.5">
              {s.state === "done" ? (
                <BadgeCheck size={24} className="text-mint" aria-hidden />
              ) : s.state === "current" ? (
                <CircleDot size={24} className="text-signal" aria-hidden />
              ) : (
                <Circle size={24} className="text-fog-500" aria-hidden />
              )}
            </span>
            <div>
              <p className={`text-sm font-bold ${s.state === "next" ? "text-fog-300" : ""}`}>
                {s.label}
                {s.state === "current" && <span className="ml-2 rounded-full bg-signal/15 px-2 py-0.5 text-[11px] text-signal">next</span>}
              </p>
              <p className="text-xs text-fog-300">
                {s.detail}
                {s.at && <span className="num"> · {new Date(s.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}

export function CaseFilePanel({ caseFile }: { caseFile: CaseFile }) {
  return (
    <Section title="Case file" icon={<FileText size={18} aria-hidden />}>
      <p className="font-semibold">{caseFile.subject}</p>
      <dl className="flex flex-col gap-3 text-sm">
        <div>
          <dt className="text-xs text-fog-500">Observed condition</dt>
          <dd>{caseFile.observed_condition}</dd>
        </div>
        <div>
          <dt className="text-xs text-fog-500">Safety implications</dt>
          <dd>{caseFile.safety_implications}</dd>
        </div>
        {caseFile.supporting_evidence.length > 0 && (
          <div>
            <dt className="text-xs text-fog-500">Supporting evidence</dt>
            <dd>
              <ul className="list-inside list-disc">
                {caseFile.supporting_evidence.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </dd>
          </div>
        )}
        <div>
          <dt className="text-xs text-fog-500">Recommended inspection</dt>
          <dd>{caseFile.recommended_inspection}</dd>
        </div>
      </dl>
    </Section>
  );
}

export function EvidenceMedia({ reports }: { reports: CaseReport[] }) {
  const withFrames = reports.filter((r) => r.frames.length);
  const voices = reports.filter((r) => r.transcript);
  const problems = reports.flatMap((r) => r.extraction?.issues ?? []);
  if (!withFrames.length && !voices.length && problems.length <= 1) return null;
  return (
    <Section title="Evidence" icon={<Video size={18} aria-hidden />} note={<span className="num text-xs text-fog-300">{reports.length} report{reports.length > 1 ? "s" : ""}</span>}>
      {withFrames.map((r) => (
        <div key={r.id} className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {r.frames.map((f, i) => (
            <figure key={f.url} className="relative aspect-[4/5] overflow-hidden rounded-xl bg-ink-800">
              <Image src={f.url} alt={`Video frame ${i + 1}`} fill sizes="160px" className="object-cover" placeholder="blur" blurDataURL={PHOTO_BLUR} />
              <figcaption className="num absolute bottom-1 left-1 rounded bg-ink-950/75 px-1.5 text-[10px]">
                F{i + 1}
                {f.time !== null ? ` · ${f.time}s` : ""}
              </figcaption>
            </figure>
          ))}
        </div>
      ))}
      {problems.length > 1 && (
        <ul className="flex flex-col gap-1.5 text-sm">
          {problems.map((p, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-2">
              <span className="font-bold">{CATEGORY_LABELS[p.category]}</span>
              <span className="text-fog-300">{p.summary}</span>
              {p.frames.length > 0 && <span className="num text-xs text-fog-500">frames {p.frames.map((f) => f + 1).join(", ")}</span>}
            </li>
          ))}
        </ul>
      )}
      {voices.map((r) => (
        <div key={r.id} className="rounded-xl bg-white/4 p-3 text-sm">
          <p className="flex items-center gap-2 text-xs text-fog-500">
            <Mic size={13} aria-hidden /> Voice note{r.language ? ` · ${r.language}` : ""}
          </p>
          <p className="mt-1">{r.transcript}</p>
          {r.summaryLocal && <p className="mt-2 text-fog-300">{r.summaryLocal}</p>}
        </div>
      ))}
    </Section>
  );
}
