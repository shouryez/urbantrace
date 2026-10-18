"use client";

// The app's living background: soft colour fields over a street grid that drift, turn and change
// colour as the page scrolls. Only transform and opacity animate; reduced motion keeps it still.
import { motion, useScroll, useSpring, useTransform } from "motion/react";
import { useReducedMotionSafe } from "@/components/motion/useReducedMotionSafe";

export function Backdrop() {
  const reduce = useReducedMotionSafe();
  const { scrollYProgress } = useScroll();
  const p = useSpring(scrollYProgress, { stiffness: 60, damping: 20, mass: 0.6 });

  const y1 = useTransform(p, [0, 1], ["-10%", "30%"]);
  const x1 = useTransform(p, [0, 1], ["-8%", "18%"]);
  const y2 = useTransform(p, [0, 1], ["20%", "-25%"]);
  const x2 = useTransform(p, [0, 1], ["10%", "-15%"]);
  const rot = useTransform(p, [0, 1], [0, 40]);
  const scale = useTransform(p, [0, 0.5, 1], [1, 1.25, 1.05]);
  // Hue shifts as you scroll: violet and cyan at the top, ion blue lower down, violet again at the end.
  // Status colours (ember, amber, mint, signal) are never used here; they keep their meaning.
  const violet = useTransform(p, [0, 0.45], [0.55, 0.1]);
  const ion = useTransform(p, [0.2, 0.6, 0.9], [0, 0.4, 0.15]);
  const violetEnd = useTransform(p, [0.6, 1], [0, 0.45]);
  const gridY = useTransform(p, [0, 1], ["0%", "-12%"]);
  const gridRotate = useTransform(rot, (n) => n * 0.1);

  return (
    <div aria-hidden className="no-print pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-ink-950">
      <motion.div className="street-grid absolute -inset-[20%] opacity-[0.35]" style={reduce ? undefined : { y: gridY, rotate: gridRotate }} />
      <motion.div
        className="absolute -top-[20%] -left-[15%] size-[70vmax] rounded-full bg-[radial-gradient(closest-side,rgb(167_139_250/0.55),transparent)] blur-3xl"
        style={reduce ? { opacity: 0.45 } : { x: x1, y: y1, rotate: rot, scale, opacity: violet }}
      />
      <motion.div
        className="absolute -right-[20%] top-[10%] size-[60vmax] rounded-full bg-[radial-gradient(closest-side,rgb(56_211_245/0.4),transparent)] blur-3xl"
        style={reduce ? { opacity: 0.35 } : { x: x2, y: y2, scale }}
      />
      <motion.div
        className="absolute bottom-[-30%] left-[10%] size-[65vmax] rounded-full bg-[radial-gradient(closest-side,rgb(110_139_255/0.45),transparent)] blur-3xl"
        style={reduce ? { opacity: 0 } : { x: x2, y: y1, opacity: ion }}
      />
      <motion.div
        className="absolute right-[-10%] bottom-[-25%] size-[55vmax] rounded-full bg-[radial-gradient(closest-side,rgb(167_139_250/0.35),transparent)] blur-3xl"
        style={reduce ? { opacity: 0 } : { x: x1, opacity: violetEnd }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgb(5_7_12/0.85))]" />
    </div>
  );
}

