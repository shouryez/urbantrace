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
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-6 md:py-8">
      <p className="kicker flex items-center gap-2 text-fog-300">
        <span aria-hidden className="h-px w-6 bg-fog-500" />
        New civic report
      </p>
      <div className="panel glow rounded-[32px] p-5 [--glow:rgb(167_139_250/0.35)] md:p-8">
        <Suspense fallback={<div className="h-64 skeleton rounded-card" />}>
          <Wizard searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
