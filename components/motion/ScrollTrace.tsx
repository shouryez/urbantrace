"use client";

import { motion, useScroll, useSpring, useTransform } from "motion/react";
import { Check } from "lucide-react";

const d = "M12 0 C 4 250, 20 500, 12 1000";

/** Desktop: a dotted line down the left edge that fills with yellow as you scroll, from an orange pin to a green check. */
export function ScrollTrace() {
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });
  const checkOpacity = useTransform(progress, [0.94, 1], [0, 1]);
  const checkScale = useTransform(progress, [0.94, 1], [0.6, 1]);
  return (
    <div aria-hidden className="pointer-events-none fixed top-0 left-6 z-30 hidden h-screen w-6 md:block">
      <svg className="h-full w-full" viewBox="0 0 24 1000" preserveAspectRatio="none">
        <defs>
          <mask id="trace-mask">
            <motion.path d={d} stroke="white" strokeWidth={8} fill="none" style={{ pathLength: progress }} />
          </mask>
        </defs>
        {/* grey dots underneath, yellow dots revealed by the mask */}
        <path d={d} stroke="#2B3038" strokeWidth={3} strokeDasharray="0 14" strokeLinecap="round" fill="none" vectorEffect="non-scaling-stroke" />
        <path
          d={d}
          stroke="#F5B700"
          strokeWidth={3}
          strokeDasharray="0 14"
          strokeLinecap="round"
          fill="none"
          vectorEffect="non-scaling-stroke"
          mask="url(#trace-mask)"
        />
      </svg>
      <span className="absolute top-20 left-1/2 size-3 -translate-x-1/2 rounded-full border-2 border-asphalt-950 bg-alert-500" />
      <motion.span
        style={{ opacity: checkOpacity, scale: checkScale }}
        className="absolute bottom-6 left-1/2 -ml-3 flex size-6 items-center justify-center rounded-full bg-verified-500 text-asphalt-950"
      >
        <Check size={14} strokeWidth={2.5} />
      </motion.span>
    </div>
  );
}
