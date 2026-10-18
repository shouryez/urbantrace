"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { motion, useInView, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { IssueCard } from "@/components/issue/IssueCard";
import { buttonClasses } from "@/components/ui/Button";
import type { IssueFeature } from "@/lib/issues";
import { useReducedMotionSafe } from "@/components/motion/useReducedMotionSafe";

const LiveMapStrip = dynamic(() => import("./LiveMapStrip"), {
  ssr: false,
  loading: () => <div className="skeleton h-full w-full" />,
});

const EXPO = [0.22, 1, 0.36, 1] as const;

/** Section 7: a strip of the real map with real pins, and the three newest issue cards. */
export function LiveMap({ issues }: { issues: IssueFeature[] }) {
  const reduce = useReducedMotionSafe();
  const ref = useRef<HTMLElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const play = useInView(stripRef, { once: true, margin: "0px 0px -20% 0px" });
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const x = useTransform(scrollYProgress, [0, 1], ["6%", "-6%"]);
  const newest = issues.slice(0, 3);

  return (
    <section ref={ref} data-glow="center" className="mx-auto flex min-h-svh w-full max-w-6xl flex-col justify-center gap-8 overflow-x-clip px-4 py-24 md:px-16">
      <motion.div
        className="flex flex-wrap items-end justify-between gap-4"
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: reduce ? 0.15 : 0.6, ease: EXPO }}
      >
        <div className="flex flex-col gap-3">
          <p className="kicker text-mist-300">Live map</p>
          <h2 className="font-display text-[32px] leading-tight font-semibold md:text-[40px]">What Bengaluru is reporting now.</h2>
        </div>
        <Link href="/map" className={buttonClasses("secondary")}>
          Open the live map
        </Link>
      </motion.div>

      <div ref={stripRef} className="relative h-[280px] overflow-hidden rounded-card border border-white/6 md:h-[360px]">
        <LiveMapStrip issues={issues} play={play} reduce={reduce} />
      </div>

      {newest.length > 0 ? (
        <motion.ul style={reduce ? undefined : { x }} className="grid gap-4 sm:grid-cols-3">
          {newest.map((f) => (
            <li key={f.properties.id}>
              <Link href={`/issue/${f.properties.id}`} className="block rounded-card">
                <IssueCard issue={f.properties} />
              </Link>
            </li>
          ))}
        </motion.ul>
      ) : (
        <p className="text-mist-300">
          No issues yet.{" "}
          <Link href="/report" className="text-marking-400 underline-offset-4 hover:underline">
            Be the first to report one.
          </Link>
        </p>
      )}
    </section>
  );
}
