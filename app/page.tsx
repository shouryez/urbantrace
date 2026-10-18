import { connection } from "next/server";
import { Suspense } from "react";
import { FortyToOne } from "@/components/landing/FortyToOne";
import { Footer } from "@/components/landing/Footer";
import { Hero, HeroCounters } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Landing } from "@/components/landing/Landing";
import { LiveMap } from "@/components/landing/LiveMap";
import { OpenStack } from "@/components/landing/OpenStack";
import { Problem } from "@/components/landing/Problem";
import { ProofOfFix } from "@/components/landing/ProofOfFix";
import { BackerCount } from "@/components/ui/BackerCount";
import { CITY_BBOX, fetchIssues, getCityStats, getLatestFix } from "@/lib/issues-query";

const COUNTER_LABELS = ["issues reported", "people backing them", "fixes verified"] as const;

function Counters({ values }: { values: (number | null)[] }) {
  return (
    <HeroCounters
      items={COUNTER_LABELS.map((label, i) => ({
        label,
        value: values[i] == null ? <span className="text-mist-300">–</span> : <BackerCount value={values[i]} fromZero />,
      }))}
    />
  );
}

async function LiveCounters() {
  await connection(); // live data: read at request time, not while prerendering
  const stats = await getCityStats();
  return <Counters values={stats ? [stats.issues, stats.backers, stats.verified] : [null, null, null]} />;
}

async function LatestFix() {
  await connection(); // live data: read at request time, not while prerendering
  return <ProofOfFix fix={await getLatestFix()} />;
}

async function LiveIssues() {
  await connection(); // live data: read at request time, not while prerendering
  const issues = await fetchIssues(CITY_BBOX, {}, 40).catch((err: unknown) => {
    console.error(err);
    return [];
  });
  return <LiveMap issues={issues} />;
}

export default function Home() {
  return (
    <Landing>
      {/* section 2 slides over the sticky hero */}
      <div className="relative">
        <Hero
          counters={
            <Suspense fallback={<Counters values={[null, null, null]} />}>
              <LiveCounters />
            </Suspense>
          }
        />
        <Problem />
      </div>
      <HowItWorks />
      <FortyToOne />
      <Suspense fallback={<ProofOfFix fix={null} />}>
        <LatestFix />
      </Suspense>
      <OpenStack />
      <Suspense fallback={<div className="mx-auto h-svh w-full max-w-6xl px-4 py-24 md:px-16"><div className="skeleton h-[360px] rounded-card" /></div>}>
        <LiveIssues />
      </Suspense>
      <Footer />
    </Landing>
  );
}
