import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
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
import { getIssue } from "@/lib/issue-detail";

export const metadata: Metadata = {
  title: "Issue · UrbanTrace",
};

async function IssueView({ params }: { params: PageProps<"/issue/[id]">["params"] }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const issue = await getIssue(id);
  if (!issue) notFound();

  const latest = issue.verifications.at(-1);

  return (
    <article className="flex flex-col gap-8">
      <div className="relative aspect-[16/9] overflow-hidden rounded-photo bg-asphalt-700">
        {issue.photoUrl && (
          <Image placeholder="blur" blurDataURL={PHOTO_BLUR} src={issue.photoUrl} alt={issue.summary} fill priority sizes="(min-width: 768px) 768px, 100vw" className="object-cover" />
        )}
        <StatusPill status={issue.status} className="absolute top-3 left-3" />
      </div>
      {issue.photoCredit && <p className="-mt-6 text-xs text-mist-300">Photo: {issue.photoCredit}</p>}

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <CategoryChip category={issue.category} />
          <span className="font-mono text-sm text-mist-300">#{issue.id}</span>
        </div>
        <h1 className="font-display text-[32px] leading-tight font-semibold">{issue.summary}</h1>
        <p className="text-mist-300">{issue.address ?? `${issue.lat.toFixed(5)}, ${issue.lng.toFixed(5)}`}</p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-sm text-mist-300">
          <LiveBackers issueId={issue.id} initial={issue.backerCount} />
          <span>reported {timeAgo(issue.createdAt)} ago</span>
          {issue.depthClass && <span>depth {issue.depthClass} (estimated)</span>}
        </div>
        <SeverityMeter value={issue.severity} className="max-w-md" />
      </header>

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
        <section className="flex flex-col gap-1 rounded-card border border-white/6 bg-asphalt-800 p-5">
          <p className="kicker text-mist-300">Responsible body</p>
          <p className="font-display text-[22px] font-semibold">{issue.bodyName}</p>
        </section>
      )}

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
        </section>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-[22px] font-semibold">Issue trail</h2>
        <TraceTimeline events={issue.events} />
      </section>
    </article>
  );
}

export default function IssuePage({ params }: PageProps<"/issue/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6">
      <Link href="/map" className={buttonClasses("ghost", "no-print self-start px-0")}>
        <ArrowLeft size={16} strokeWidth={1.75} aria-hidden /> Live map
      </Link>
      <Suspense fallback={<div className="aspect-[16/9] skeleton rounded-photo" />}>
        <IssueView params={params} />
      </Suspense>
    </main>
  );
}
