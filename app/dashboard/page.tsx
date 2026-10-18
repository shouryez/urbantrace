import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { getDashboard } from "@/lib/dashboard";

export const metadata: Metadata = {
  title: "Dashboard · UrbanTrace",
};

async function DashboardData() {
  await connection(); // live data: read at request time, not while prerendering
  const data = await getDashboard().catch((err: unknown) => {
    console.error(err);
    return null;
  });
  if (!data) return <p className="text-mist-300">The dashboard could not load right now. Try again in a moment.</p>;
  return <Dashboard data={data} />;
}

export default function DashboardPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8 md:px-6">
      <header className="flex flex-col gap-2">
        <p className="kicker text-mist-300">Dashboard</p>
        <h1 className="font-display text-[32px] leading-tight font-semibold">How each corporation is doing</h1>
        <p className="max-w-2xl text-mist-300">
          Open, fix claimed and verified issues per city corporation, and the median time from the first report to a
          verified fix.
        </p>
      </header>
      <Suspense fallback={<div className="skeleton h-96 rounded-card" />}>
        <DashboardData />
      </Suspense>
    </main>
  );
}
