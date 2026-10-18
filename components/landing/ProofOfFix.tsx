"use client";

import Image from "next/image";
import { AnimatePresence, motion, useMotionValue, useMotionValueEvent, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { useReducedMotionSafe } from "@/components/motion/useReducedMotionSafe";
import { PHOTO_BLUR } from "@/lib/blur";
import { RoadArt } from "./RoadArt";

const EXPO = [0.22, 1, 0.36, 1] as const;

type ProofOfFixProps = {
  /** A real verified pair when one exists; drawn art otherwise. */
  fix: { beforeUrl: string; afterUrl: string } | null;
};

function Stamp() {
  return (
    <motion.span
      className="absolute right-4 bottom-4 rounded-[10px] border-[3px] border-verified-500 bg-asphalt-950/60 px-3 py-1 font-display text-xl font-bold text-verified-500 uppercase"
      initial={{ scale: 1.4, rotate: -8, opacity: 0 }}
      animate={{ scale: 1, rotate: -8, opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 22 }}
    >
      Verified fixed
    </motion.span>
  );
}

/** Section 5: before and after on a slider; the divider follows scroll right to left and can be dragged. */
export function ProofOfFix({ fix }: ProofOfFixProps) {
  const reduce = useReducedMotionSafe();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  // Divider position, 100 = all before, 0 = all after.
  const split = useMotionValue(100);
  // Percent of the after photo revealed, for the stamp and the slider's aria value.
  const [revealed, setRevealed] = useState(0);
  const stamped = revealed > 85;
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    if (!reduce) split.set(Math.max(0, Math.min(100, 100 - ((v - 0.1) / 0.7) * 100)));
  });
  useMotionValueEvent(split, "change", (v) => setRevealed(Math.round(100 - v)));
  // Reduced motion: no scroll link; start with the after photo shown and the stamp in place.
  useEffect(() => {
    if (reduce) split.set(0);
  }, [reduce, split]);

  // The after layer slides in from the right; its image slides back the other way so it stays put.
  const layerX = useTransform(split, (v) => `${v}%`);
  const imageX = useTransform(split, (v) => `${-v}%`);
  const dividerX = useTransform(split, (v) => `${v}%`);

  const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    split.set(Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") split.set(Math.max(0, split.get() - 5));
    else if (e.key === "ArrowRight") split.set(Math.min(100, split.get() + 5));
    else return;
    e.preventDefault();
  };

  const layer = (side: "before" | "after"): ReactNode =>
    fix ? (
      <Image placeholder="blur" blurDataURL={PHOTO_BLUR}
        src={side === "before" ? fix.beforeUrl : fix.afterUrl}
        alt={side === "before" ? "Before the fix" : "After the fix"}
        fill
        sizes="(min-width: 768px) 720px, 100vw"
        className="object-cover"
      />
    ) : (
      <RoadArt fixed={side === "after"} className="h-full w-full" />
    );

  return (
    <section ref={ref} data-glow="center" className={reduce ? "" : "relative h-[200vh]"}>
      <div
        className={`mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 md:px-16 ${
          reduce ? "py-24" : "sticky top-0 h-svh justify-center will-change-transform"
        }`}
      >
        <div className="flex flex-col gap-3">
          <p className="kicker text-mist-300">Proof of fix</p>
          <h2 className="font-display text-[32px] leading-tight font-semibold md:text-[40px]">It closes only with proof.</h2>
          <p className="max-w-xl text-mist-300">
            Whoever fixes it takes an after photo from the same spot, within <span className="font-mono text-chalk-50">50 m</span>.
            The model compares the two, and the issue turns green only if it sees the repair.
          </p>
        </div>
        <motion.div
          role="slider"
          tabIndex={0}
          aria-label="Before and after divider, percent from the left"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={100 - revealed}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            fromPointer(e);
          }}
          onPointerMove={(e) => e.buttons === 1 && fromPointer(e)}
          onKeyDown={onKey}
          className="relative aspect-[4/3] w-full cursor-ew-resize touch-pan-y overflow-hidden rounded-photo bg-asphalt-700 select-none md:aspect-[16/9]"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: reduce ? 0.15 : 0.6, ease: EXPO }}
        >
          <div className="absolute inset-0">{layer("before")}</div>
          <motion.div className="absolute inset-0 overflow-hidden" style={{ x: layerX }}>
            <motion.div className="absolute inset-0" style={{ x: imageX }}>
              {layer("after")}
            </motion.div>
          </motion.div>
          <span className="kicker absolute top-3 left-3 rounded-full bg-asphalt-900/72 px-2 py-1 backdrop-blur-[16px]">Before</span>
          <span className="kicker absolute top-3 right-3 rounded-full bg-asphalt-900/72 px-2 py-1 backdrop-blur-[16px]">After</span>
          <motion.span aria-hidden className="pointer-events-none absolute inset-0" style={{ x: dividerX }}>
            <span className="absolute inset-y-0 left-0 w-0.5 -translate-x-1/2 bg-chalk-50" />
            <span className="absolute top-1/2 left-0 size-9 -translate-1/2 rounded-full border-2 border-chalk-50 bg-asphalt-900/72" />
          </motion.span>
          <AnimatePresence>{stamped && <Stamp />}</AnimatePresence>
        </motion.div>
      </div>
    </section>
  );
}
