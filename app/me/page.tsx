import type { Metadata } from "next";
import { ImpactView } from "@/components/impact/ImpactView";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Me · UrbanTrace" };

export default function MePage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-8 md:px-6">
      <PageHeader kicker="Me" title="What your reports" accent="changed">
        Counted from this phone. There are no points or rankings here, just outcomes on the ground.
      </PageHeader>
      <ImpactView />
    </main>
  );
}
