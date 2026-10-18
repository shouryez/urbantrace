import type { Metadata } from "next";
import { MeView } from "@/components/account/MeView";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Me · UrbanTrace" };

export default function MePage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-8 md:px-6">
      <PageHeader kicker="Me" title="Your reports, and what they" accent="changed">
        Track every complaint you filed or backed, from the AI&apos;s first reading to the verified fix.
      </PageHeader>
      <MeView />
    </main>
  );
}
