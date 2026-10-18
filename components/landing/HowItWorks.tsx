"use client";

import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import { BadgeCheck, Camera, GitMerge, ScanLine, Send, type LucideIcon } from "lucide-react";
import { useRef, useState } from "react";
import { ScanLoader } from "@/components/motion/ScanLoader";
import { BackerCount } from "@/components/ui/BackerCount";
import { CategoryChip } from "@/components/ui/CategoryChip";
import { SeverityMeter } from "@/components/ui/SeverityMeter";
import { StatusPill } from "@/components/ui/StatusPill";
import { useReducedMotionSafe } from "@/components/motion/useReducedMotionSafe";
import { PhoneFrame } from "./PhoneFrame";
import { RoadArt } from "./RoadArt";

const EXPO = [0.22, 1, 0.36, 1] as const;

const STEPS: { title: string; body: string; Icon: LucideIcon }[] = [
  { title: "Snap", body: "Take a photo from any phone browser. GPS tags the spot; drop a pin by hand if it is poor.", Icon: Camera },
  { title: "Understand", body: "An open weight model on our own machine reads the type, severity and a one line summary. You can correct it.", Icon: ScanLine },
  { title: "Merge", body: "A report of the same kind within 30 m joins the existing issue as a backer, not a new ticket.", Icon: GitMerge },
  { title: "Route", body: "The issue goes to the right corporation, BWSSB or BESCOM, with a formal complaint letter drafted for it.", Icon: Send },
  { title: "Verify", body: "It closes only when an after photo of the same spot shows the repair.", Icon: BadgeCheck },
];

function Screen({ step }: { step: number }) {
  const photo = (
    <div className="relative aspect-[4/5] overflow-hidden rounded-[12px]">
      <RoadArt className="h-full w-full" />
    </div>
  );
  switch (step) {
    case 0:
      return (
        <div className="relative flex h-full flex-col">
          <RoadArt className="absolute inset-0 h-full w-full" />
          <span className="relative mt-10 ml-4 self-start rounded-full bg-asphalt-900/72 px-2 py-1 font-mono text-[11px] backdrop-blur-[16px]">
            GPS ± 8 m
          </span>
          <span className="relative mx-auto mt-auto mb-8 flex size-16 items-center justify-center rounded-full border-4 border-asphalt-950 bg-marking-400 text-asphalt-950">
            <Camera size={26} strokeWidth={1.75} />
          </span>
        </div>
      );
    case 1:
      return (
        <div className="flex h-full flex-col gap-3 p-4 pt-10">
          <ScanLoader active className="aspect-[4/3] rounded-[12px]">
            <RoadArt className="h-full w-full" />
          </ScanLoader>
          <p className="kicker text-[10px] text-mist-300">AI reading</p>
          <CategoryChip category="pothole" className="self-start" />
          <SeverityMeter value={4} />
          <p className="text-[13px] leading-snug">A deep pothole with standing water across the left lane.</p>
        </div>
      );
    case 2:
      return (
        <div className="flex h-full flex-col gap-3 p-4 pt-10">
          <p className="font-display text-lg font-semibold">Same problem?</p>
          <div className="grid grid-cols-2 gap-2">
            {photo}
            {photo}
          </div>
          <p className="text-[13px] text-mist-300">
            Issue <span className="font-mono text-chalk-50">#128</span> is <span className="font-mono text-chalk-50">18 m</span> away.
          </p>
          <p className="flex items-baseline gap-2 font-mono text-[32px] leading-none">
            <BackerCount value={40} fromZero /> <span className="font-sans text-sm text-mist-300">backers</span>
          </p>
          <span className="mt-auto mb-4 rounded-full bg-marking-400 py-2 text-center text-sm font-medium text-asphalt-950">Yes, add my support</span>
        </div>
      );
    case 3:
      return (
        <div className="flex h-full flex-col gap-3 p-4 pt-10">
          <div className="rounded-[14px] border border-white/6 bg-asphalt-800 p-3">
            <p className="kicker text-[10px] text-mist-300">Routed to</p>
            <p className="text-sm font-medium">Bengaluru South City Corporation</p>
          </div>
          <div className="flex flex-1 flex-col gap-2 rounded-[14px] bg-chalk-50 p-3 text-[11px] leading-snug text-asphalt-950">
            <p className="font-bold">Repair request: pothole on 80 Feet Road</p>
            <p>To the Commissioner,</p>
            <p>Residents report a deep pothole with standing water across the left lane. Forty people have backed this issue.</p>
            <p className="mt-auto">Residents of Bengaluru, via UrbanTrace</p>
          </div>
        </div>
      );
    default:
      return (
        <div className="flex h-full flex-col gap-3 p-4 pt-10">
          <div className="grid grid-cols-2 gap-2">
            <div className="aspect-[4/5] overflow-hidden rounded-[12px]">
              <RoadArt className="h-full w-full" />
            </div>
            <div className="aspect-[4/5] overflow-hidden rounded-[12px]">
              <RoadArt fixed className="h-full w-full" />
            </div>
          </div>
          <div className="flex flex-col gap-2 rounded-[14px] border-2 border-verified-500 bg-asphalt-800 p-3">
            <StatusPill status="verified" className="self-start" />
            <p className="font-display text-lg font-semibold">Verified fixed</p>
            <p className="text-[12px] text-mist-300">Same spot; the pothole has been patched and the surface is level.</p>
          </div>
        </div>
      );
  }
}

function StepList({ active, all }: { active: number; all: boolean }) {
  return (
    <ol className="flex flex-col gap-5">
      {STEPS.map(({ title, body, Icon }, i) => {
        const lit = all || i === active;
        return (
          <li key={title} className={`flex gap-4 transition-opacity duration-300 ease-out ${lit ? "opacity-100" : "opacity-35"}`}>
            <span
              className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
                lit ? "bg-marking-400 text-asphalt-950" : "bg-asphalt-700 text-mist-300"
              }`}
            >
              <Icon size={18} strokeWidth={1.75} aria-hidden />
            </span>
            <div className="flex flex-col gap-1">
              <h3 className="font-display text-[22px] font-semibold">
                <span className="mr-2 font-mono text-sm text-mist-300">0{i + 1}</span>
                {title}
              </h3>
              <p className="max-w-md text-mist-300">{body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Phones: a row of step dots and only the active step's text, so the phone fits on screen. */
function MobileStep({ active }: { active: number }) {
  const { title, body } = STEPS[active] ?? STEPS[0]!;
  return (
    <div className="flex flex-col gap-3 md:hidden">
      <div className="flex items-center gap-2" aria-hidden>
        {STEPS.map(({ title: t, Icon }, i) => (
          <span
            key={t}
            className={`flex size-8 items-center justify-center rounded-full transition-opacity duration-300 ${
              i <= active ? "bg-marking-400 text-asphalt-950" : "bg-asphalt-700 text-mist-300 opacity-60"
            }`}
          >
            <Icon size={14} strokeWidth={1.75} />
          </span>
        ))}
      </div>
      <p className="font-display text-[22px] font-semibold">
        <span className="mr-2 font-mono text-sm text-mist-300">0{active + 1}</span>
        {title}
      </p>
      <p className="min-h-[3lh] text-sm text-mist-300">{body}</p>
    </div>
  );
}

/** Section 3: 500vh tall with a sticky phone; scroll progress picks the step and the screen crossfades. */
export function HowItWorks() {
  const reduce = useReducedMotionSafe();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [step, setStep] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => setStep(Math.min(4, Math.floor(v * 5))));

  const heading = (
    <div className="flex flex-col gap-3">
      <p className="kicker text-mist-300">How it works</p>
      <h2 className="font-display text-[32px] leading-tight font-semibold md:text-[40px]">From a photo to a verified fix.</h2>
    </div>
  );

  // Reduced motion: no sticky scroll; every step shows, the phone shows the final screen.
  if (reduce) {
    return (
      <section ref={ref} data-glow="right" className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-24 md:grid-cols-2 md:px-16">
        <div className="flex flex-col gap-8">
          {heading}
          <StepList active={4} all />
        </div>
        <PhoneFrame className="mx-auto">
          <Screen step={4} />
        </PhoneFrame>
      </section>
    );
  }

  return (
    <section ref={ref} data-glow="right" className="relative h-[500vh]">
      <div className="sticky top-0 mx-auto grid h-svh w-full max-w-6xl content-center items-center gap-6 px-4 will-change-transform md:grid-cols-2 md:gap-10 md:px-16 md:pt-16">
        <motion.div
          className="flex flex-col gap-5 md:gap-8"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: EXPO }}
        >
          {heading}
          <div className="max-md:hidden">
            <StepList active={step} all={false} />
          </div>
          <MobileStep active={step} />
        </motion.div>
        <PhoneFrame className="mx-auto max-md:w-[min(220px,52vw)]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              className="h-full"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: EXPO }}
            >
              <Screen step={step} />
            </motion.div>
          </AnimatePresence>
        </PhoneFrame>
      </div>
    </section>
  );
}
