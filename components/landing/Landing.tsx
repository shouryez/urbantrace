"use client";

import "lenis/dist/lenis.css";
import { ReactLenis } from "lenis/react";
import { motion, useScroll, useTransform } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { ScrollTrace } from "@/components/motion/ScrollTrace";
import { useReducedMotionSafe } from "@/components/motion/useReducedMotionSafe";

const GRID = 160;
const DASH = 120;

/** Three parallax layers: street grid at 0.3x scroll, lane dashes at 0.6x, grain (body::before) still. */
function Parallax() {
  const { scrollY } = useScroll();
  const gridY = useTransform(scrollY, (v) => -((v * 0.3) % GRID));
  const dashY = useTransform(scrollY, (v) => -((v * 0.6) % DASH));
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <motion.div
        style={{ y: gridY, height: `calc(100% + ${GRID}px)` }}
        className="absolute inset-x-0 top-0 opacity-40 [background-image:linear-gradient(#2B3038_1px,transparent_1px),linear-gradient(90deg,#2B3038_1px,transparent_1px)] [background-size:160px_160px]"
      />
      <motion.div
        style={{ y: dashY, height: `calc(100% + ${DASH}px)` }}
        className="absolute top-0 right-[12%] w-1 opacity-[0.07] [background-image:linear-gradient(#F1F3F2_50%,transparent_50%)] [background-size:4px_120px]"
      />
      <motion.div
        style={{ y: dashY, height: `calc(100% + ${DASH}px)` }}
        className="absolute top-0 left-[18%] w-1 opacity-[0.05] [background-image:linear-gradient(#F1F3F2_50%,transparent_50%)] [background-size:4px_120px]"
      />
    </div>
  );
}

/** A faint yellow glow behind the section in view; it slides to the next one. */
function SectionGlow() {
  const [side, setSide] = useState<"left" | "right" | "center">("center");
  useEffect(() => {
    const sections = [...document.querySelectorAll<HTMLElement>("[data-glow]")];
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setSide((e.target as HTMLElement).dataset.glow as typeof side);
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);
  const x = side === "left" ? "-30vw" : side === "right" ? "30vw" : "0vw";
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed top-1/2 left-1/2 -z-10 -mt-[45vmax] -ml-[45vmax] size-[90vmax] rounded-full bg-[radial-gradient(closest-side,rgba(245,183,0,0.07),transparent)]"
      animate={{ x }}
      transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
    />
  );
}

/** Landing only: Lenis smooth scroll, parallax, section glow and the scroll trace. All off with reduced motion. */
export function Landing({ children }: { children: ReactNode }) {
  const reduce = useReducedMotionSafe();
  return (
    <>
      {!reduce && <ReactLenis root options={{ lerp: 0.1 }} />}
      {!reduce && <Parallax />}
      <SectionGlow />
      {!reduce && <ScrollTrace />}
      <main className="relative isolate flex flex-col">{children}</main>
    </>
  );
}
