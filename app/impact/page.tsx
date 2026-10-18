import type { Metadata } from "next";
import { ImpactView } from "@/components/impact/ImpactView";

export const metadata: Metadata = { title: "Your civic impact · UrbanTrace" };

export default function ImpactPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-8 md:px-6">
      <header className="flex flex-col gap-2">
        <p className="kicker text-fog-300">Your civic impact</p>
        <h1 className="font-display text-[36px] leading-tight font-bold">What your reports changed</h1>
        <p className="max-w-2xl text-fog-300">Counted from this phone only. There are no points or rankings here, just outcomes on the ground.</p>
      </header>
      <ImpactView />
    </main>
  );
}
