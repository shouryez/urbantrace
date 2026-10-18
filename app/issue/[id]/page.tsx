import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, History, Network, ScanSearch } from "lucide-react";
import { CitizenConfirm, ScenarioPanel, TimeMachinePanel } from "@/components/case/Interactive";
import { AssignmentPanel, CaseFilePanel, EvidenceMedia, EvidencePanel, JourneyPanel, PriorityPanel, Section } from "@/components/case/Panels";
import { BeforeAfter } from "@/components/issue/BeforeAfter";
import { timeAgo } from "@/components/issue/IssueCard";
import { LetterCard } from "@/components/issue/LetterCard";
import { LiveBackers } from "@/components/issue/LiveBackers";
import { TraceTimeline } from "@/components/issue/TraceTimeline";
import { buttonClasses } from "@/components/ui/Button";
import { CategoryChip } from "@/components/ui/CategoryChip";
import { SeverityMeter } from "@/components/ui/SeverityMeter";
import { StatusPill } from "@/components/ui/StatusPill";
import { PHOTO_BLUR } from "@/lib/blur";
import { journey } from "@/lib/intel/journey";
import { getIssue } from "@/lib/issue-detail";
import { supabaseAdmin } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Issue · UrbanTrace",
};

async function IssueView({ params }: { params: PageProps<"/issue/[id]">["params"] }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const issue = await getIssue(id);
  if (!issue) notFound();

  const latest = issue.verifications.at(-1);
  const incident =
    issue.incidentId !== null
      ? (await supabaseAdmin().from("incidents").select("id, title, report_count, kind, status").eq("id", issue.incidentId).maybeSingle()).data
      : null;

  return (
    <article className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
      <div className="flex flex-col gap-6 lg:sticky lg:top-24">
        <div className="relative aspect-[16/9] overflow-hidden rounded-photo bg-asphalt-700 glow">
          {issue.photoUrl && (
            <Image
              placeholder="blur"
              blurDataURL={PHOTO_BLUR}
              src={issue.photoUrl}
              alt={issue.summary}
              fill
              priority
              sizes="(min-width: 1024px) 480px, 100vw"
              className="object-cover"
            />
          )}
          <StatusPill status={issue.status} className="absolute top-3 left-3" />
        </div>
        {issue.photoCredit && <p className="-mt-6 text-xs text-mist-300">Photo: {issue.photoCredit}</p>}

        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <CategoryChip category={issue.category} />
            <span className="font-mono text-sm text-mist-300">#{issue.id}</span>
          </div>
          <h1 className="font-display text-[30px] leading-[1.1] font-bold tracking-tight md:text-[36px]">{issue.summary}</h1>
          <p className="text-mist-300">{issue.address ?? `${issue.lat.toFixed(5)}, ${issue.lng.toFixed(5)}`}</p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-sm text-mist-300">
            <LiveBackers issueId={issue.id} initial={issue.backerCount} />
            <span>reported {timeAgo(issue.createdAt)} ago</span>
            {issue.depthClass && <span>depth {issue.depthClass} (estimated)</span>}
          </div>
          <SeverityMeter value={issue.severity} className="max-w-md" />
        </header>

        {issue.recurrenceOf !== null && (
          <Link href={`/issue/${issue.recurrenceOf}`} className="flex items-start gap-3 rounded-card border border-ember/40 bg-ember/10 p-4 text-sm">
            <History size={18} className="mt-0.5 shrink-0 text-ember" aria-hidden />
            <span>
              <span className="font-extrabold text-ember uppercase">Recurring issue.</span> This came back
              {issue.repairLastedDays !== null ? ` ${issue.repairLastedDays} days` : ""} after a verified repair of issue{" "}
              <span className="font-mono">#{issue.recurrenceOf}</span>. A lasting fix is needed, not another patch.
            </span>
          </Link>
        )}
        {incident && (
          <Link href={`/incident/${incident.id}`} className="flex items-start gap-3 rounded-card border border-violet/40 bg-violet/10 p-4 text-sm">
            <Network size={18} className="mt-0.5 shrink-0 text-violet" aria-hidden />
            <span>
              Part of {incident.kind === "alert" ? "a civic alert" : "an incident"}: <span className="font-bold">{incident.title as string}</span> ·{" "}
              <span className="font-mono">{incident.report_count as number} reports</span>. See the root cause graph.
            </span>
          </Link>
        )}

        <div className="flex flex-wrap gap-3">
          {issue.status !== "verified" && (
            <Link href={`/report?target=${issue.id}`} className={buttonClasses("secondary")}>
              I see this too
            </Link>
          )}
          {issue.status === "open" && (
            <Link href={`/issue/${issue.id}/verify`} className={buttonClasses("primary")}>
              Submit fix photo
            </Link>
          )}
          {issue.status === "fix_claimed" && <p className="text-sm text-mist-300">A fix photo is being checked right now.</p>}
        </div>
        {issue.bodyName && (
          <section className="flex flex-col gap-1 rounded-card panel p-5">
            <p className="kicker text-mist-300">Responsible body</p>
            <p className="font-display text-[22px] font-semibold">{issue.bodyName}</p>
          </section>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        {issue.priority && <PriorityPanel priority={issue.priority} />}
        <JourneyPanel steps={journey(issue.stage, issue.status, issue.events)} />
        {issue.assignment && <AssignmentPanel assignment={issue.assignment} />}
        {issue.evidence && <EvidencePanel evidence={issue.evidence} />}
        <EvidenceMedia reports={issue.reports} />
        <TimeMachinePanel lat={issue.lat} lng={issue.lng} segmentKey={issue.segmentKey} />
        {issue.status !== "verified" && <ScenarioPanel endpoint={`/api/issues/${issue.id}/scenario`} initial={issue.scenario} />}
        {issue.caseFile && <CaseFilePanel caseFile={issue.caseFile} />}

        {issue.bodyName && (
          <section className="flex flex-col gap-3">
            <h2 className="font-display text-[22px] font-semibold">Complaint letter</h2>
            <LetterCard issueId={issue.id} initialLetter={issue.letter} toEmail={issue.bodyEmail} />
          </section>
        )}

        {latest && issue.photoUrl && (
          <section className="flex flex-col gap-3">
            <h2 className="font-display text-[22px] font-semibold">Before and after</h2>
            <BeforeAfter beforeUrl={issue.photoUrl} afterUrl={latest.afterPhotoUrl} passed={latest.passed} />
            {latest.verdict && (
              <p className="text-sm text-mist-300">
                {latest.verdict.reason} <span className="font-mono">({Math.round(latest.distanceM)} m from the issue)</span>
              </p>
            )}
            {latest.photoCredit && <p className="text-xs text-mist-300">After photo: {latest.photoCredit}</p>}
            {latest.checks && (
              <Section
                title="Repair verification"
                icon={<ScanSearch size={18} aria-hidden />}
                note={
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-extrabold uppercase ${latest.outcome === "verified" ? "bg-mint text-ink-950" : latest.outcome === "partial" ? "bg-amber text-ink-950" : "bg-ember text-ink-950"}`}
                  >
                    {latest.outcome === "partial" ? "partially resolved" : latest.outcome} · <span className="num">{latest.score}%</span>
                  </span>
                }
              >
                <ul className="flex flex-col gap-2 text-sm">
                  {latest.checks.map((c) => (
                    <li key={c.key} className="flex items-start justify-between gap-3">
                      <span>
                        <span className="font-bold uppercase">{c.label}</span>
                        <span className="text-fog-300"> · {c.detail}</span>
                      </span>
                      <span
                        className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-ink-950 ${c.state === "pass" ? "bg-mint" : c.state === "warn" ? "bg-amber" : "bg-ember"}`}
                      >
                        {c.state === "pass" ? "✓" : c.state === "warn" ? "!" : "✕"}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </section>
        )}
        {issue.status === "verified" && <CitizenConfirm issueId={issue.id} initial={issue.confirmations} />}

        <section className="flex flex-col gap-4">
          <h2 className="font-display text-[22px] font-semibold">Issue trail</h2>
          <TraceTimeline events={issue.events} />
        </section>
      </div>
    </article>
  );
}

export default function IssuePage({ params }: PageProps<"/issue/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 md:px-6">
      <Link href="/map" className={buttonClasses("ghost", "no-print self-start px-0")}>
        <ArrowLeft size={16} strokeWidth={1.75} aria-hidden /> Live map
      </Link>
      <Suspense fallback={<div className="aspect-[16/9] skeleton rounded-photo" />}>
        <IssueView params={params} />
      </Suspense>
    </main>
  );
}
