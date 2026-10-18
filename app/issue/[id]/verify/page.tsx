import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { VerifyFlow } from "@/components/issue/VerifyFlow";
import { buttonClasses } from "@/components/ui/Button";
import { getIssue } from "@/lib/issue-detail";
import { mlEnabled } from "@/lib/ml";

export const metadata: Metadata = {
  title: "Submit fix photo · UrbanTrace",
};

async function Verify({ params }: { params: PageProps<"/issue/[id]/verify">["params"] }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const issue = await getIssue(id);
  if (!issue || !issue.photoUrl) notFound();

  return (
    <>
      <Link href={`/issue/${id}`} className={buttonClasses("ghost", "self-start px-0")}>
        <ArrowLeft size={16} strokeWidth={1.75} aria-hidden /> Issue <span className="font-mono">#{id}</span>
      </Link>
      <h1 className="font-display text-[32px] leading-tight font-semibold">Submit fix photo</h1>
      {issue.status === "open" ? (
        <VerifyFlow issueId={id} beforeUrl={issue.photoUrl} offerConsent={mlEnabled()} />
      ) : (
        <p className="text-mist-300">
          {issue.status === "verified" ? "This issue is already verified as fixed." : "A fix photo for this issue is being checked right now."}
        </p>
      )}
    </>
  );
}

export default function VerifyPage({ params }: PageProps<"/issue/[id]/verify">) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 px-4 py-6">
      <Suspense fallback={<div className="aspect-[4/3] skeleton rounded-photo" />}>
        <Verify params={params} />
      </Suspense>
    </main>
  );
}
