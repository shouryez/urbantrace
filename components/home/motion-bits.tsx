"use client";

// Small motion pieces for the landing chapters. Only transform and opacity animate, and all of them
// fall back to a short fade with reduced motion.
import { animate, motion, useInView } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useReducedMotionSafe } from "@/components/motion/useReducedMotionSafe";

const EXPO = [0.22, 1, 0.36, 1] as const;

export function Reveal({ children, delay = 0, y = 28, className = "" }: { children: ReactNode; delay?: number; y?: number; className?: string }) {
  const reduce = useReducedMotionSafe();
  return (
    <motion.div
      key={reduce ? "r" : "m"}
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={reduce ? { duration: 0.15 } : { duration: 0.7, ease: EXPO, delay }}
    >
      {children}
    </motion.div>
  );
}

/** A headline whose words rise one after another. */
export function Words({ text, className = "", delay = 0 }: { text: string; className?: string; delay?: number }) {
  const reduce = useReducedMotionSafe();
  const words = text.split(" ");
  return (
    <span className={className} aria-label={text}>
      {words.map((w, i) => (
        <span key={i} aria-hidden className="inline-block overflow-hidden pb-[0.08em] align-bottom">
          <motion.span
            key={reduce ? "r" : "m"}
            className="inline-block"
            initial={reduce ? { opacity: 0 } : { y: "105%" }}
            whileInView={reduce ? { opacity: 1 } : { y: 0 }}
            viewport={{ once: true }}
            transition={reduce ? { duration: 0.15 } : { duration: 0.8, ease: EXPO, delay: delay + i * 0.06 }}
          >
            {w}
            {i < words.length - 1 && " "}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

/** A number that counts up once it scrolls into view. */
export function CountTo({ value, suffix = "", decimals = 0, className = "" }: { value: number; suffix?: string; decimals?: number; className?: string }) {
  const reduce = useReducedMotionSafe();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!inView || reduce) return;
    const controls = animate(0, value, { duration: 1.4, ease: EXPO, onUpdate: setShown });
    return () => controls.stop();
  }, [inView, reduce, value]);
  return (
    <span ref={ref} className={`num ${className}`}>
      {(reduce ? value : shown).toFixed(decimals)}
      {suffix}
    </span>
  );
}

/** Text that types itself out once it is in view. */
export function Typewriter({ text, speed = 18, className = "" }: { text: string; speed?: number; className?: string }) {
  const reduce = useReducedMotionSafe();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -15% 0px" });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!inView || reduce || n >= text.length) return;
    const id = window.setTimeout(() => setN((c) => c + 1), speed);
    return () => window.clearTimeout(id);
  }, [inView, reduce, n, text.length, speed]);
  const shown = reduce ? text.length : n;
  return (
    <span ref={ref} className={className}>
      {text.slice(0, shown)}
      {shown < text.length && <span className="caret text-signal">▍</span>}
    </span>
  );
}
