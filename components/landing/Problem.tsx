"use client";

import { motion, useMotionValue, useSpring } from "motion/react";
import { CopyX, LockKeyhole, ShieldQuestion, SignpostBig, type LucideIcon } from "lucide-react";
import type { PointerEvent } from "react";
import { BackerCount } from "@/components/ui/BackerCount";
import { WARD_COUNT } from "@/lib/routing";
import { useReducedMotionSafe } from "@/components/motion/useReducedMotionSafe";

const EXPO = [0.22, 1, 0.36, 1] as const;

const STATS = [
  { value: 5, suffix: "", label: "city corporations" },
  { value: WARD_COUNT, suffix: "", label: "wards" },
  { value: 3, suffix: "+", label: "agencies: corporation, BWSSB, BESCOM" },
];

const PROBLEMS: { title: string; body: string; Icon: LucideIcon }[] = [
  {
    title: "Unclear who to tell",
    body: "Roads go to the corporation, leaks to BWSSB, sparking lines to BESCOM. Most people give up before they find out which.",
    Icon: SignpostBig,
  },
  {
    title: "Duplicates hide scale",
    body: "Forty people report one pothole and it looks like forty small complaints instead of one urgent one.",
    Icon: CopyX,
  },
  {
    title: "No proof of repair",
    body: "Tickets get closed without anyone checking that the road was actually fixed.",
    Icon: ShieldQuestion,
  },
  {
    title: "Closed, paid AI tools",
    body: "Smart reporting tools send your photos to a paid AI vendor, and nobody else can run them.",
    Icon: LockKeyhole,
  },
];

/** A card that tilts up to 4 degrees toward the pointer on desktop. */
function TiltCard({ title, body, Icon, index }: (typeof PROBLEMS)[number] & { index: number }) {
  const reduce = useReducedMotionSafe();
  const rx = useSpring(useMotionValue(0), { stiffness: 400, damping: 22 });
  const ry = useSpring(useMotionValue(0), { stiffness: 400, damping: 22 });
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (reduce || e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    ry.set(((e.clientX - r.left) / r.width - 0.5) * 8);
    rx.set(-((e.clientY - r.top) / r.height - 0.5) * 8);
  };
  const onLeave = () => {
    rx.set(0);
    ry.set(0);
  };
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={reduce ? { duration: 0.15 } : { duration: 0.6, ease: EXPO, delay: index * 0.06 }}
      style={{ perspective: 800 }}
    >
      <motion.div
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        style={{ rotateX: rx, rotateY: ry }}
        className="flex h-full flex-col gap-3 rounded-card border border-white/6 bg-asphalt-800 p-6"
      >
        <Icon size={28} strokeWidth={1.75} className="text-mist-300" aria-hidden />
        <h3 className="font-display text-[22px] font-semibold">{title}</h3>
        <p className="text-mist-300">{body}</p>
      </motion.div>
    </motion.div>
  );
}

/** Section 2: three stat tiles and the four problems. */
export function Problem() {
  return (
    // A solid sheet with a rounded top, so it reads as sliding over the fading hero.
    <section data-glow="left" className="relative z-10 rounded-t-[32px] border-t border-white/6 bg-asphalt-950">
      <div className="mx-auto flex min-h-svh w-full max-w-6xl flex-col justify-center gap-10 px-4 py-24 md:px-16">
        <div className="flex flex-col gap-3">
          <p className="kicker text-mist-300">The problem</p>
          <h2 className="max-w-2xl font-display text-[32px] leading-tight font-semibold md:text-[40px]">
            A broken road in Bengaluru has a long way to travel before anyone fixes it.
          </h2>
        </div>
        <dl className="grid grid-cols-3 gap-3 md:gap-4">
          {STATS.map((s) => (
            <div key={s.label} className="flex flex-col gap-1 rounded-card border border-white/6 bg-asphalt-900 p-4 md:p-6">
              <dd className="font-mono text-[28px] leading-none font-medium md:text-[40px]">
                <BackerCount value={s.value} fromZero />
                {s.suffix}
              </dd>
              <dt className="text-xs font-medium text-mist-300 md:text-sm">{s.label}</dt>
            </div>
          ))}
        </dl>
        <div className="grid gap-4 sm:grid-cols-2">
          {PROBLEMS.map((p, i) => (
            <TiltCard key={p.title} {...p} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
