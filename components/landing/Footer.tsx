"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Camera } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { REPO_URL, TEAM } from "@/lib/site";
import { useReducedMotionSafe } from "@/components/motion/useReducedMotionSafe";

const HEADLINE = "Seen a pothole today?";
const WORDS = HEADLINE.split(" ");
// Index of each word's first letter, for the stagger.
const STARTS = WORDS.reduce<number[]>((acc, _w, i) => [...acc, i === 0 ? 0 : acc[i - 1]! + WORDS[i - 1]!.length], []);
const EXPO = [0.22, 1, 0.36, 1] as const;

/** Section 8: the call to action, links and the team. */
export function Footer() {
  const reduce = useReducedMotionSafe();
  return (
    <footer data-glow="center" className="mx-auto flex min-h-[80svh] w-full max-w-6xl flex-col justify-center gap-10 px-4 py-24 md:px-16">
      {/* remount when reduced motion resolves after hydration, so the right variants run */}
      <motion.h2
        key={reduce ? "reduced" : "full"}
        className="font-display text-[40px] leading-[1.05] font-bold tracking-[-0.02em] sm:text-[56px] md:text-[72px]"
        initial="hidden"
        whileInView="shown"
        viewport={{ once: true, margin: "0px 0px -15% 0px" }}
        aria-label={HEADLINE}
      >
        {WORDS.map((word, w) => (
          <span key={w} aria-hidden className="mr-[0.25em] inline-flex overflow-hidden pb-1">
            {[...word].map((ch, c) => {
              const i = (STARTS[w] ?? 0) + c;
              return (
                <motion.span
                  key={i}
                  className="inline-block"
                  variants={
                    reduce
                      ? { hidden: { y: 0, opacity: 0 }, shown: { y: 0, opacity: 1, transition: { duration: 0.15 } } }
                      : { hidden: { y: "100%" }, shown: { y: 0, transition: { duration: 0.6, ease: EXPO, delay: i * 0.03 } } }
                  }
                >
                  {ch}
                </motion.span>
              );
            })}
          </span>
        ))}
      </motion.h2>
      <div className="flex flex-wrap gap-3">
        <Link href="/report" className={buttonClasses("primary", "px-6 py-3 text-base")}>
          <Camera size={18} strokeWidth={1.75} aria-hidden /> Report it now
        </Link>
        <Link href="/map" className={buttonClasses("secondary", "px-6 py-3 text-base")}>
          See the live map
        </Link>
      </div>
      <div className="flex flex-col gap-4 border-t border-white/6 pt-8 text-sm text-mist-300 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-1">
          <p className="font-medium text-chalk-50">Team {TEAM.name}</p>
          <p>{TEAM.members.join(" · ")}</p>
        </div>
        <ul className="flex flex-wrap gap-x-6 gap-y-2">
          {REPO_URL && (
            <li>
              <a href={REPO_URL} className="text-marking-400 underline-offset-4 hover:underline">
                GitHub
              </a>
            </li>
          )}
          <li>
            {REPO_URL ? (
              <a href={`${REPO_URL}/blob/main/LICENSE`} className="text-marking-400 underline-offset-4 hover:underline">
                MIT licence
              </a>
            ) : (
              "MIT licence"
            )}
          </li>
          <li>Map data © OpenStreetMap contributors</li>
        </ul>
      </div>
    </footer>
  );
}
