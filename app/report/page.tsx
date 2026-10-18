import type { Metadata } from "next";
import { Suspense } from "react";
import { ReportWizard } from "@/components/report/ReportWizard";
import { mlEnabled } from "@/lib/ml";

export const metadata: Metadata = {
  title: "Report an issue · UrbanTrace",
};

/** "I see this too" links here as /report?target=<issue id>. */
async function Wizard({ searchParams }: { searchParams: PageProps<"/report">["searchParams"] }) {
  const target = Number((await searchParams).target);
  return <ReportWizard targetId={Number.isInteger(target) && target > 0 ? target : null} mlOn={mlEnabled()} />;
}

export default function ReportPage({ searchParams }: PageProps<"/report">) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 py-8">
      <Suspense fallback={<div className="h-64 skeleton rounded-card" />}>
        <Wizard searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
