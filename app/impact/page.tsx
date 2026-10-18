import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { ImpactView } from "@/components/impact/ImpactView";

export const metadata: Metadata = { title: "Your civic impact · UrbanTrace" };

export default function ImpactPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-8 md:px-6">
      <PageHeader kicker="Your civic impact" title="What your reports" accent="changed">
        Counted from this phone only. There are no points or rankings here, just outcomes on the ground.
      </PageHeader>
      <ImpactView />
    </main>
  );
}
