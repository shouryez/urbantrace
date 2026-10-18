"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { useReducedMotionSafe } from "@/components/motion/useReducedMotionSafe";

type BackerCountProps = {
  value: number;
  /** Roll up from 0 the first time it scrolls into view (landing counters, success screen). */
  fromZero?: boolean;
  className?: string;
};

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/** Mono number that rolls digit by digit when it changes. */
export function BackerCount({ value, fromZero = false, className = "" }: BackerCountProps) {
  const reduce = useReducedMotionSafe();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const shown = fromZero && !inView && !reduce ? 0 : value;
  const text = String(Math.max(0, Math.round(value)));
  // Pad the shown value to the final width so the digits do not jump while rolling.
  const digits = String(Math.max(0, Math.round(shown))).padStart(text.length, "0");

  return (
    <span ref={ref} className={`inline-flex font-mono tabular-nums ${className}`}>
      <span className="sr-only">{text}</span>
      <span aria-hidden className="inline-flex">
        {[...digits].map((d, i) => (
          <span key={text.length - i} className="relative inline-block h-[1.2em] overflow-hidden leading-[1.2em]">
            <motion.span
              className="flex flex-col"
              initial={false}
              animate={{ y: `${-Number(d) * 10}%` }}
              transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 22, delay: (digits.length - 1 - i) * 0.06 }}
            >
              {DIGITS.map((n) => (
                <span key={n} className="block h-[1.2em]">
                  {n}
                </span>
              ))}
            </motion.span>
          </span>
        ))}
      </span>
    </span>
  );
}
