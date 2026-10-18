"use client";

import { AnimatePresence, motion, useMotionValueEvent, useScroll, useTransform, type MotionValue } from "motion/react";
import { useRef, useState, type ReactNode } from "react";
import { useReducedMotionSafe } from "@/components/motion/useReducedMotionSafe";
import { StreetGrid } from "./RoadArt";

const EXPO = [0.22, 1, 0.36, 1] as const;

// Forty scattered spots around the centre, in percent of the map, from a fixed seed so server and client match.
const DOTS = (() => {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  return Array.from({ length: 40 }, () => {
    const angle = rand() * Math.PI * 2;
    const r = 14 + rand() * 30;
    return { x: Math.cos(angle) * r, y: Math.sin(angle) * r * 0.8, at: rand() * 0.25 };
  });
})();

/** One report dot: moves from its spot to the centre as the section scrolls. */
function Dot({ progress, x, y, at }: { progress: MotionValue<number>; x: number; y: number; at: number }) {
  const left = useTransform(progress, [at, 0.75], [`${x}cqw`, "0cqw"]);
  const top = useTransform(progress, [at, 0.75], [`${y}cqh`, "0cqh"]);
  const opacity = useTransform(progress, [0.7, 0.8], [1, 0]);
  return (
    <motion.span
      style={{ x: left, y: top, opacity }}
      className="absolute top-1/2 left-1/2 -mt-1.5 -ml-1.5 size-3 rounded-full border-2 border-asphalt-950 bg-alert-500"
    />
  );
}

function Pin() {
  return (
    <motion.span
      className="absolute top-1/2 left-1/2 -mt-7 -ml-7 flex size-14 items-center justify-center rounded-full border-4 border-asphalt-950 bg-alert-500 font-mono text-xl font-medium text-asphalt-950"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 22 }}
    >
      40
    </motion.span>
  );
}

/** Section 4: 300vh with a sticky map; forty dots gather into one pin that shows 40. */
export function FortyToOne() {
  const reduce = useReducedMotionSafe();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [merged, setMerged] = useState(false);
  useMotionValueEvent(scrollYProgress, "change", (v) => setMerged(v >= 0.8));

  const text = (
    <div className="flex flex-col gap-3">
      <p className="kicker text-mist-300">Duplicate merge</p>
      <h2 className="font-display text-[32px] leading-tight font-semibold md:text-[40px]">Forty reports, one issue.</h2>
      <p className="max-w-md text-mist-300">
        A report of the same kind within <span className="font-mono text-chalk-50">30 m</span> joins the first one as a backer. The
        corporation sees one pothole with <span className="font-mono text-chalk-50">40</span> people behind it, not forty
        small complaints.
      </p>
    </div>
  );

  const map = (children: ReactNode) => (
    <motion.div
      className="relative aspect-square w-full max-w-[520px] overflow-hidden rounded-card border border-white/6 [container-type:size]"
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, ease: EXPO }}
    >
      <StreetGrid className="absolute inset-0 h-full w-full" />
      {children}
    </motion.div>
  );

  if (reduce) {
    return (
      <section ref={ref} data-glow="left" className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-24 md:grid-cols-2 md:px-16">
        {text}
        {map(<Pin />)}
      </section>
    );
  }

  return (
    <section ref={ref} data-glow="left" className="relative h-[300vh]">
      <div className="sticky top-0 mx-auto grid h-svh w-full max-w-6xl content-center items-center gap-8 px-4 will-change-transform md:grid-cols-2 md:gap-10 md:px-16">
        {text}
        {map(
          <>
            {DOTS.map((d, i) => (
              <Dot key={i} progress={scrollYProgress} {...d} />
            ))}
            <AnimatePresence>{merged && <Pin />}</AnimatePresence>
          </>,
        )}
      </div>
    </section>
  );
}
