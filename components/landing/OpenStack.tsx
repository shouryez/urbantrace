"use client";

import { motion, useInView, useMotionValueEvent, useScroll } from "motion/react";
import { Cpu, Database, Globe, Server, Smartphone, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useReducedMotionSafe } from "@/components/motion/useReducedMotionSafe";

const EXPO = [0.22, 1, 0.36, 1] as const;

const SAMPLE = `{
  "is_civic_issue": true,
  "category": "pothole",
  "severity": 4,
  "summary": "Deep pothole with standing water across the left lane."
}`;

const LICENCES: [string, string][] = [
  ["Gemma 4", "Apache 2.0"],
  ["Ollama", "MIT"],
  ["Next.js", "MIT"],
  ["Supabase", "Apache 2.0"],
  ["PostGIS", "GPL 2.0"],
  ["Leaflet", "BSD 2-Clause"],
  ["OpenStreetMap", "ODbL"],
  ["Tailwind CSS", "MIT"],
  ["Motion", "MIT"],
  ["Lenis", "MIT"],
  ["Lucide", "ISC"],
  ["Zod", "MIT"],
  ["sharp", "Apache 2.0"],
];

type NodeInfo = { title: string; note: string; Icon: LucideIcon; model?: boolean };

const BROWSER: NodeInfo = { title: "Phone browser", note: "Camera and GPS, no app install", Icon: Smartphone };
const SERVER: NodeInfo = { title: "Next.js server", note: "Every model call goes from here", Icon: Server };
const MODEL: NodeInfo = { title: "Ollama · Gemma 4", note: "Open weight model, self hosted", Icon: Cpu, model: true };
const DB: NodeInfo = { title: "Supabase", note: "Postgres, PostGIS, Storage, Realtime", Icon: Database };
const OSM: NodeInfo = { title: "OpenStreetMap", note: "Map tiles and addresses", Icon: Globe };

function Node({ node, lit }: { node: NodeInfo; lit: boolean }) {
  const { title, note, Icon, model } = node;
  return (
    <div className={`relative flex items-center gap-3 rounded-card border bg-asphalt-800 p-4 ${model ? "border-marking-400/30" : "border-white/6"}`}>
      {/* glow: only its opacity changes */}
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-0 rounded-card shadow-[0_0_32px_rgba(245,183,0,0.28)] transition-opacity duration-300 ease-out ${
          lit ? "opacity-100" : "opacity-0"
        }`}
      />
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-full transition-opacity duration-300 ${
          model ? "bg-marking-400 text-asphalt-950" : "bg-asphalt-700 text-chalk-50"
        } ${lit ? "opacity-100" : "opacity-50"}`}
      >
        <Icon size={18} strokeWidth={1.75} aria-hidden />
      </span>
      <div className="flex flex-col">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-mist-300">{note}</p>
      </div>
    </div>
  );
}

/** The sample JSON typing itself out, 12 ms a character, once in view. */
function TypedJson({ reduce }: { reduce: boolean }) {
  const ref = useRef<HTMLPreElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -20% 0px" });
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!inView || reduce || count >= SAMPLE.length) return;
    const id = window.setTimeout(() => setCount((c) => c + 1), 12);
    return () => window.clearTimeout(id);
  }, [inView, reduce, count]);
  const shown = reduce ? SAMPLE.length : count;
  return (
    <pre
      ref={ref}
      className="overflow-x-auto rounded-card border border-white/6 bg-asphalt-900 p-5 font-mono text-[13px] leading-relaxed text-mist-300"
      aria-label="Sample model reply"
    >
      <code>
        {SAMPLE.slice(0, shown)}
        <span aria-hidden className={`text-marking-400 ${shown >= SAMPLE.length ? "opacity-0" : ""}`}>
          ▍
        </span>
      </code>
    </pre>
  );
}

/** Section 6: the architecture as five nodes in a dashed "runs on our machine" boundary, the JSON, licence chips. */
export function OpenStack() {
  const reduce = useReducedMotionSafe();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "center center"] });
  const [lit, setLit] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => setLit(Math.min(5, Math.floor(v * 6))));
  const on = (i: number) => reduce || lit > i;

  return (
    <section ref={ref} data-glow="right" className="mx-auto flex min-h-svh w-full max-w-6xl flex-col justify-center gap-10 px-4 py-24 md:px-16">
      <motion.div
        className="flex flex-col gap-3"
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: reduce ? 0.15 : 0.6, ease: EXPO }}
      >
        <p className="kicker text-mist-300">Open at every layer</p>
        <h2 className="max-w-2xl font-display text-[32px] leading-tight font-semibold md:text-[40px]">
          No paid AI API. Photos never leave our machine for a model.
        </h2>
        <p className="max-w-xl text-mist-300">
          Any residents&apos; association, campus or ward office can run the whole thing. The browser never talks to the model;
          the server does, and every reply is checked against a fixed schema.
        </p>
      </motion.div>

      <div className="grid items-center gap-4 lg:grid-cols-[1fr_1.4fr_1fr]">
        <Node node={BROWSER} lit={on(0)} />
        <div className="relative flex flex-col gap-4 p-5 pt-9">
          <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
            <rect
              x="1"
              y="1"
              rx="20"
              className={reduce ? "" : "march"}
              style={{ width: "calc(100% - 2px)", height: "calc(100% - 2px)" }}
              fill="none"
              stroke="#5E6773"
              strokeWidth="1.5"
              strokeDasharray="8 8"
            />
          </svg>
          <p className="kicker absolute top-3 left-5 text-[11px] text-mist-300">Runs on our machine</p>
          <Node node={SERVER} lit={on(1)} />
          <Node node={MODEL} lit={on(2)} />
        </div>
        <div className="flex flex-col gap-4">
          <Node node={DB} lit={on(3)} />
          <Node node={OSM} lit={on(4)} />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <TypedJson reduce={reduce} />
        <ul className="flex flex-wrap content-start gap-2" aria-label="Licences">
          {LICENCES.map(([name, licence]) => (
            <li key={name} className="flex items-center gap-2 rounded-full border border-white/6 bg-asphalt-800 px-3 py-1.5 text-sm">
              <span className="font-medium">{name}</span>
              <span className="font-mono text-xs text-mist-300">{licence}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
