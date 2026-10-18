"use client";

import Link from "next/link";
import { motion, useScroll, useTransform } from "motion/react";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { useReducedMotionSafe } from "@/components/motion/useReducedMotionSafe";
import { StreetGrid } from "./RoadArt";

const HEADLINE = "Every pothole, traced to its fix.";
const EXPO = [0.22, 1, 0.36, 1] as const;
const TRACE = "M40 300 C 160 300, 140 120, 280 140 S 420 40, 520 40";

/** The dotted trace from an orange pin to a green check, drawn over 1.6 s. */
function HeroTrace({ reduce }: { reduce: boolean }) {
  return (
    <svg viewBox="0 0 560 340" className="h-full w-full" aria-hidden>
      <defs>
        <mask id="hero-trace-mask">
          <motion.path
            d={TRACE}
            stroke="white"
            strokeWidth={10}
            fill="none"
            initial={{ pathLength: reduce ? 1 : 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: reduce ? 0 : 1.6, ease: EXPO, delay: 0.3 }}
          />
        </mask>
      </defs>
      <path d={TRACE} stroke="#2B3038" strokeWidth={4} strokeDasharray="0 16" strokeLinecap="round" fill="none" />
      <path d={TRACE} stroke="#F5B700" strokeWidth={4} strokeDasharray="0 16" strokeLinecap="round" fill="none" mask="url(#hero-trace-mask)" />
    </svg>
  );
}

/** Section 1: headline, the trace from pin to check, buttons and live counters. */
export function Hero({ counters }: { counters: ReactNode }) {
  const reduce = useReducedMotionSafe();
  // The section is sticky, so progress is page scroll over one screen height.
  const { scrollY } = useScroll();
  const progress = useTransform(scrollY, (v) => (typeof window === "undefined" ? 0 : Math.min(1, v / window.innerHeight)));
  const scale = useTransform(progress, [0, 1], [1, 0.94]);
  const opacity = useTransform(progress, [0, 0.9], [1, 0]);
  const visibility = useTransform(progress, (p) => (p >= 1 ? "hidden" : "visible"));
  const words = HEADLINE.split(" ");

  return (
    <section data-glow="center" className="sticky top-0 h-svh min-h-[640px]">
      <motion.div
        style={reduce ? undefined : { scale, opacity, visibility }}
        className="flex h-full items-center overflow-hidden will-change-transform"
      >
        {/* street map drifting slowly behind */}
        <div aria-hidden className="absolute -inset-24 opacity-60 [animation:drift_40s_ease-in-out_infinite_alternate]">
          <StreetGrid className="h-full w-full" />
        </div>
        <div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgba(14,16,19,0.2),rgba(14,16,19,0.85)_75%,#0E1013)]" />

        {/* trace from the open pin to the verified check */}
        <div aria-hidden className="absolute top-[9%] right-[6%] h-[24%] w-[88%] opacity-70 md:top-[18%] md:right-[4%] md:h-[44%] md:w-[46%] md:opacity-100">
          <HeroTrace reduce={reduce} />
          <span className="absolute bottom-[8%] left-[4%] size-5 rounded-full border-[3px] border-asphalt-950 bg-alert-500" />
          <motion.span
            className="absolute top-[4%] right-[4%] flex size-8 items-center justify-center rounded-full bg-verified-500 text-asphalt-950"
            initial={reduce ? false : { scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 22, delay: 1.8 }}
          >
            <Check size={18} strokeWidth={2.5} />
          </motion.span>
        </div>

        <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 md:px-16">
          <p className="kicker text-marking-400">Open source · runs on our own machine</p>
          <h1 className="max-w-3xl font-display text-[40px] leading-[1.05] font-bold tracking-[-0.02em] sm:text-[56px] md:text-[72px]">
            {words.map((w, i) => (
              <span key={i} className="inline-block overflow-hidden pb-1 align-bottom">
                <motion.span
                  className="inline-block"
                  initial={reduce ? { opacity: 0 } : { y: 24, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={reduce ? { duration: 0.15 } : { duration: 0.6, ease: EXPO, delay: i * 0.06 }}
                >
                  {w}
                  {i < words.length - 1 && " "}
                </motion.span>
              </span>
            ))}
          </h1>
          <motion.p
            className="max-w-xl text-lg text-mist-300"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduce ? 0.15 : 0.6, delay: reduce ? 0 : 0.4 }}
          >
            Snap it. We route it. It closes only with proof.
          </motion.p>
          <div className="flex flex-wrap gap-3">
            <Link href="/report" className={buttonClasses("primary", "px-6 py-3 text-base")}>
              Report an issue
            </Link>
            <Link href="/map" className={buttonClasses("secondary", "px-6 py-3 text-base")}>
              See the live map
            </Link>
          </div>
          <div className="mt-6">{counters}</div>
        </div>
      </motion.div>
    </section>
  );
}

/** The three live counters; the numbers come from the database. */
export function HeroCounters({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid max-w-xl grid-cols-3 gap-4 border-t border-white/6 pt-5">
      {items.map((it) => (
        <div key={it.label} className="flex flex-col gap-1">
          <dd className="font-mono text-[28px] leading-none font-medium text-chalk-50 md:text-[40px]">{it.value}</dd>
          <dt className="text-xs font-medium text-mist-300 md:text-sm">{it.label}</dt>
        </div>
      ))}
    </dl>
  );
}
