import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { WardDirectory } from "@/components/ward/WardDirectory";
import { listWards } from "@/lib/wards";

export const metadata: Metadata = { title: "Wards · UrbanTrace" };

async function Directory() {
  await connection();
  const wards = await listWards();
  if (!wards.length) {
    return (
      <p className="rounded-card panel p-5 text-fog-200">
        The ward directory appears once the 369 wards are loaded (migration 0008, then <span className="font-mono">npm run seed:wards</span>).
      </p>
    );
  }
  return <WardDirectory wards={wards} />;
}

export default function WardsPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8 md:px-6">
      <PageHeader kicker="Ward directory" title="Every ward, and who" accent="answers for it">
        All 369 wards of the five city corporations: who runs each zone, the area&apos;s MLA, the ward&apos;s budget and population, and every open problem.
      </PageHeader>
      <Suspense fallback={<div className="skeleton h-96 rounded-card" />}>
        <Directory />
      </Suspense>
    </main>
  );
}
