"use client";

// The landing page: one fixed 3D Bengaluru behind nine chapters. Scrolling flies the camera from
// chapter to chapter and changes which civic layers glow, so the background tells the story too.
import "lenis/dist/lenis.css";
import dynamic from "next/dynamic";
import Link from "next/link";
import Lenis from "lenis";
import type { Map as MLMap } from "maplibre-gl";
import { motion } from "motion/react";
import {
  Accessibility,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  BadgeCheck,
  CloudRain,
  Cpu,
  GitFork,
  HardHat,
  History,
  Mic,
  Network,
  Radar,
  ScanLine,
  Siren,
  Video,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CityIncident, CityIssue } from "@/components/city/CityMap";
import { RootCauseGraph, type GraphInput } from "@/components/intel/RootCauseGraph";
import { useReducedMotionSafe } from "@/components/motion/useReducedMotionSafe";
import { REPO_URL, TEAM } from "@/lib/site";
import { cameraAt, CHAPTERS } from "./chapters";
import { CountTo, Reveal, Typewriter, Words } from "./motion-bits";

const CityMap = dynamic(() => import("@/components/city/CityMap"), { ssr: false });

export type HomeData = {
  issues: CityIssue[];
  incidents: CityIncident[];
  stats: { issues: number; backers: number; verified: number; incidents: number };
  rainMm: number;
  featured: { title: string; reportCount: number; radiusM: number; confidence: number; graph: GraphInput } | null;
};

const EXAMPLE_GRAPH: GraphInput = {
  nodes: [
    { id: "blocked_drain", label: "Blocked drain", observed: 0, root: true },
    { id: "garbage", label: "Garbage", observed: 6, root: false },
    { id: "waterlogging", label: "Waterlogging", observed: 25, root: false },
    { id: "pothole", label: "Potholes", observed: 9, root: false },
    { id: "footpath", label: "Footpath damage", observed: 3, root: false },
  ],
  edges: [
    { from: "garbage", to: "blocked_drain", strength: 0.6, why: "Waste washes into drains and chokes them" },
    { from: "blocked_drain", to: "waterlogging", strength: 0.9, why: "Water cannot drain away" },
    { from: "waterlogging", to: "pothole", strength: 0.65, why: "Standing water softens and breaks asphalt" },
    { from: "waterlogging", to: "footpath", strength: 0.4, why: "Water undermines paving" },
  ],
};

export function HomeExperience({ data }: { data: HomeData }) {
  const reduce = useReducedMotionSafe();
  const mapRef = useRef<MLMap | null>(null);
  const hudRef = useRef<HTMLSpanElement>(null);
  const lenisRef = useRef<Lenis | null>(null);
  const [chapter, setChapter] = useState(0);
  const [until, setUntil] = useState<number | null>(null);

  const span = useMemo(() => {
    const times = data.issues.map((i) => new Date(i.createdAt).getTime());
    return times.length ? { from: Math.min(...times), to: Math.max(...times) } : null;
  }, [data.issues]);

  useEffect(() => {
    if (!reduce) lenisRef.current = new Lenis({ autoRaf: true, lerp: 0.085 });
    let raf = 0;
    let lastCh = -1;
    let lastUntil = -2;
    const start = performance.now();
    const tick = () => {
      // Scroll position in chapters, from the real section offsets so tall chapters still line up.
      const y = window.scrollY + window.innerHeight * 0.35;
      const tops = [...document.querySelectorAll<HTMLElement>("main > section[data-chapter]")].map((s) => s.offsetTop);
      let x = 0;
      for (let i = 0; i < tops.length; i++) {
        const top = tops[i]!;
        const next = tops[i + 1] ?? top + window.innerHeight;
        if (y >= top) x = i + Math.min(1, (y - top) / Math.max(1, next - top));
      }
      x = Math.max(0, x - 0.5);
      const cam = cameraAt(x);
      const drift = reduce ? 0 : ((performance.now() - start) / 1000) * 1.4 * Math.max(0, 1 - x);
      mapRef.current?.jumpTo({ center: cam.center, zoom: cam.zoom, pitch: cam.pitch, bearing: cam.bearing + drift });
      const ch = Math.min(CHAPTERS.length - 1, Math.max(0, Math.round(x)));
      if (ch !== lastCh) {
        lastCh = ch;
        setChapter(ch);
      }
      // The time machine chapter replays the city's reports as you scroll through it.
      const timeIdx = CHAPTERS.findIndex((c) => c.id === "time");
      const local = x - (timeIdx - 0.5);
      const u = span && local >= 0 && local <= 1 ? Math.round(span.from + (span.to - span.from) * local) : -1;
      if (Math.abs(u - lastUntil) > 3_600_000 || (u === -1) !== (lastUntil === -1)) {
        lastUntil = u;
        setUntil(u === -1 ? null : u);
      }
      if (hudRef.current) hudRef.current.textContent = `${cam.center[1].toFixed(4)}° N · ${cam.center[0].toFixed(4)}° E`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      lenisRef.current?.destroy();
      lenisRef.current = null;
    };
  }, [reduce, span]);

  const ch = CHAPTERS[chapter]!;
  const goTo = (i: number) => {
    const top = document.querySelectorAll<HTMLElement>("main > section[data-chapter]")[i]?.offsetTop ?? 0;
    if (lenisRef.current) lenisRef.current.scrollTo(top, { duration: 1.6 });
    else window.scrollTo({ top, behavior: "smooth" });
  };

  return (
    <div className="relative bg-ink-950 text-fog-50">
      {/* The city behind every chapter */}
      <div className="fixed inset-0 z-0" aria-hidden>
        <CityMap
          issues={data.issues}
          incidents={data.incidents}
          layers={ch.layers}
          elevation={ch.elevation}
          dataOpacity={ch.opacity}
          until={ch.id === "time" ? until : null}
          interactive={false}
          initialCamera={CHAPTERS[0]!.cam}
          onReady={(m) => {
            mapRef.current = m;
          }}
        />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(5,7,12,0.94)_0%,rgba(5,7,12,0.66)_40%,rgba(5,7,12,0.05)_72%)] max-md:bg-[linear-gradient(180deg,rgba(5,7,12,0.55)_0%,rgba(5,7,12,0.82)_60%)]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-[linear-gradient(0deg,#05070c,rgba(5,7,12,0))]" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.05] [background-image:url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22160%22 height=%22160%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%222%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22/%3E%3C/svg%3E')]" />
      </div>


      {/* Chapter rail */}
      <nav aria-label="Chapters" className="fixed top-1/2 right-6 z-30 hidden -translate-y-1/2 flex-col gap-3 lg:flex">
        {CHAPTERS.map((c, i) => (
          <button key={c.id} type="button" onClick={() => goTo(i)} className="group flex cursor-pointer items-center justify-end gap-3">
            <span className={`text-xs font-bold transition-opacity ${i === chapter ? "text-fog-50 opacity-100" : "text-fog-300 opacity-0 group-hover:opacity-100"}`}>{c.label}</span>
            <span className={`num w-6 text-right text-xs ${i === chapter ? "text-signal" : "text-fog-500"}`}>{String(i).padStart(2, "0")}</span>
            <span className={`h-[2px] origin-right transition-transform duration-300 ${i === chapter ? "w-10 scale-x-100 bg-signal" : "w-10 scale-x-40 bg-white/25"}`} />
          </button>
        ))}
      </nav>

      {/* HUD */}
      <div className="glass fixed bottom-5 left-5 z-30 hidden items-center gap-3 rounded-full px-4 py-2 text-[11px] font-bold tracking-wide text-fog-300 sm:flex">
        <span className="relative flex size-2">
          <span className="pulse-ring absolute inline-flex size-full rounded-full bg-signal" />
          <span className="relative inline-flex size-2 rounded-full bg-signal" />
        </span>
        <span ref={hudRef} className="num">12.9620° N · 77.6000° E</span>
        <span className="num flex items-center gap-1">
          · <CloudRain size={12} aria-hidden /> {data.rainMm} mm in 3 days
        </span>
        <span className="text-fog-500">· live data</span>
      </div>

      <main className="relative z-10">
        <Chapter id="top">
          <Hero data={data} onNext={() => goTo(1)} />
        </Chapter>
        <Chapter id="investigate">
          <Investigator />
        </Chapter>
        <Chapter id="cause">
          <RootCause featured={data.featured} />
        </Chapter>
        <Chapter id="incidents">
          <Incidents />
        </Chapter>
        <Chapter id="proof">
          <Proof />
        </Chapter>
        <Chapter id="time" tall>
          <TimeMachine until={until} span={span} />
        </Chapter>
        <Chapter id="priority">
          <Priority />
        </Chapter>
        <Chapter id="access">
          <AccessVoice />
        </Chapter>
        <Chapter id="open">
          <OpenJoin stats={data.stats} />
        </Chapter>
      </main>
    </div>
  );
}

function Chapter({ id, children, tall = false }: { id: string; children: ReactNode; tall?: boolean }) {
  return (
    <section id={id} data-chapter className={`relative flex items-center ${tall ? "min-h-[160svh]" : "min-h-svh"} py-24`}>
      <div className="mx-auto w-full max-w-[1320px] px-5 sm:px-10 lg:pr-32">{children}</div>
    </section>
  );
}

function Kicker({ n, icon, children }: { n: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Reveal y={14} className="mb-5 flex items-center gap-3 text-xs font-extrabold tracking-[0.2em] text-fog-300 uppercase">
      <span className="num text-signal">{n}</span>
      <span className="h-px w-10 bg-white/25" />
      <span className="flex items-center gap-2">
        {icon}
        {children}
      </span>
    </Reveal>
  );
}

function Title({ children }: { children: ReactNode }) {
  return <h2 className="max-w-[16ch] font-display text-[44px] leading-[0.98] font-extrabold tracking-[-0.03em] sm:text-[64px] lg:text-[76px]">{children}</h2>;
}

function Lede({ children }: { children: ReactNode }) {
  return (
    <Reveal delay={0.15}>
      <p className="mt-6 max-w-[46ch] text-lg leading-relaxed text-fog-200">{children}</p>
    </Reveal>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="UrbanTrace home">
      <span aria-hidden className="relative flex size-8 items-center justify-center rounded-xl bg-[conic-gradient(from_200deg,#a78bfa,#38d3f5,#d9ff4a,#a78bfa)] p-[1.5px]">
        <span className="flex size-full items-center justify-center rounded-[10px] bg-ink-950">
          <span className="size-2.5 rounded-full bg-signal shadow-[0_0_12px_#d9ff4a]" />
        </span>
      </span>
      {!compact && <span className="font-display text-lg font-extrabold tracking-[-0.03em]">UrbanTrace</span>}
    </Link>
  );
}

// ---------------------------------------------------------------------------------------------

function Hero({ data, onNext }: { data: HomeData; onNext: () => void }) {
  return (
    <div className="max-w-[760px] pt-10">
      <Reveal y={10}>
        <p className="glass mb-7 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-bold text-fog-200">
          <span className="relative flex size-2">
            <span className="pulse-ring absolute inline-flex size-full rounded-full bg-mint" />
            <span className="relative inline-flex size-2 rounded-full bg-mint" />
          </span>
          Civic intelligence for Bengaluru · open source · runs on our own machine
        </p>
      </Reveal>
      <h1 className="font-display text-[52px] leading-[0.94] font-extrabold tracking-[-0.035em] sm:text-[84px] lg:text-[104px]">
        <Words text="Every civic problem, traced to its" />{" "}
        <span className="font-serif font-normal italic text-aurora">root.</span>
      </h1>
      <Reveal delay={0.35}>
        <p className="mt-7 max-w-[50ch] text-lg leading-relaxed text-fog-200 sm:text-xl">
          Snap a photo, film ten seconds or just talk. An open AI on our own machine finds every problem in it, the cause behind
          them, the team that should fix it, and closes the case only with proof.
        </p>
      </Reveal>
      <Reveal delay={0.5} className="mt-9 flex flex-wrap gap-3">
        <Link href="/report" className="group flex h-13 items-center gap-2 rounded-full bg-signal px-7 text-base font-extrabold text-ink-950 shadow-[0_10px_40px_-10px_#d9ff4a] transition-transform hover:-translate-y-0.5">
          Report an issue <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
        <Link href="/map" className="glass flex h-13 items-center gap-2 rounded-full px-7 text-base font-bold transition-transform hover:-translate-y-0.5">
          Explore the live city <ArrowUpRight size={18} aria-hidden />
        </Link>
      </Reveal>
      <Reveal delay={0.65} className="mt-14 grid max-w-[640px] grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4">
        {[
          { v: data.stats.issues, l: "issues traced" },
          { v: data.stats.backers, l: "citizen reports" },
          { v: data.stats.incidents, l: "incidents found" },
          { v: data.stats.verified, l: "fixes verified" },
        ].map((s) => (
          <div key={s.l} className="border-l border-white/12 pl-4">
            <CountTo value={s.v} className="block text-[34px] leading-none font-semibold text-fog-50" />
            <span className="mt-2 block text-xs font-bold tracking-wide text-fog-300 uppercase">{s.l}</span>
          </div>
        ))}
      </Reveal>
      <button type="button" onClick={onNext} className="mt-14 flex items-center gap-3 text-sm font-bold text-fog-300 transition-colors hover:text-fog-50">
        <span className="flex h-10 w-6 justify-center rounded-full border border-white/25 pt-2">
          <motion.span className="size-1.5 rounded-full bg-signal" animate={{ y: [0, 12, 0] }} transition={{ duration: 1.8, repeat: Infinity }} />
        </span>
        Scroll to fly through the city
      </button>
    </div>
  );
}

function Split({ text, panel }: { text: ReactNode; panel: ReactNode }) {
  return (
    <div className="grid items-center gap-12 lg:grid-cols-[1fr_minmax(0,560px)]">
      <div>{text}</div>
      <Reveal delay={0.2} y={40}>
        {panel}
      </Reveal>
    </div>
  );
}

function Panel({ children, className = "", tone = "ion" }: { children: ReactNode; className?: string; tone?: "ion" | "violet" | "mint" | "siren" | "cyan" }) {
  const glow = { ion: "rgb(110 139 255 / 0.45)", violet: "rgb(167 139 250 / 0.5)", mint: "rgb(53 224 161 / 0.4)", siren: "rgb(255 61 110 / 0.45)", cyan: "rgb(56 211 245 / 0.4)" }[tone];
  return (
    <div className={`glow rounded-card border border-white/8 bg-ink-900/85 p-6 backdrop-blur-xl ${className}`} style={{ ["--glow" as string]: glow }}>
      {children}
    </div>
  );
}

function Investigator() {
  const found = [
    { label: "Open drain", sev: "high", frame: "frame 2" },
    { label: "Waterlogging", sev: "high", frame: "frame 1" },
    { label: "Garbage accumulation", sev: "medium", frame: "frame 3" },
    { label: "Streetlight failure", sev: "medium", frame: "voice note" },
  ];
  return (
    <Split
      text={
        <>
          <Kicker n="01" icon={<ScanLine size={14} aria-hidden />}>
            AI civic investigator
          </Kicker>
          <Title>
            <Words text="Ten seconds of video. Every problem in it." />
          </Title>
          <Lede>
            Instead of one label for one photo, the model reads every frame and the voice note together, and turns messy evidence
            into a structured municipal case: primary issue, secondary issues, severity, risks and the exact frames that prove it.
          </Lede>
        </>
      }
      panel={
        <Panel tone="ion">
          <div className="flex items-center justify-between">
            <p className="kicker text-fog-300">Civic case · example</p>
            <span className="num rounded-full bg-white/8 px-2.5 py-1 text-xs text-fog-200">#1847</span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {["#3b2a22", "#1f2b3d", "#2b2a1c"].map((c, i) => (
              <div key={c} className="relative aspect-[4/5] overflow-hidden rounded-xl" style={{ background: `linear-gradient(160deg, ${c}, #0a0e16)` }}>
                <motion.span className="absolute inset-x-0 h-0.5 bg-signal shadow-[0_0_14px_#d9ff4a]" animate={{ y: ["0%", "2800%"] }} transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.3, ease: "easeInOut" }} />
                <span className="num absolute bottom-1.5 left-1.5 rounded bg-ink-950/70 px-1.5 text-[10px] text-fog-200">F{i + 1} · {i * 3}s</span>
              </div>
            ))}
          </div>
          <p className="mt-5 text-xs font-bold tracking-wide text-fog-300 uppercase">Detected</p>
          <ul className="mt-2 flex flex-col gap-2">
            {found.map((f, i) => (
              <motion.li
                key={f.label}
                className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-sm"
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.5 + i * 0.25 }}
              >
                <span className="flex items-center gap-2 font-semibold">
                  <BadgeCheck size={16} className="text-mint" aria-hidden /> {f.label}
                </span>
                <span className="num text-xs text-fog-300">
                  {f.sev} · {f.frame}
                </span>
              </motion.li>
            ))}
          </ul>
          <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-white/8 p-3">
              <p className="text-xs text-fog-300">Primary issue</p>
              <p className="font-bold">Road drainage failure</p>
            </div>
            <div className="rounded-xl border border-ember/30 p-3">
              <p className="text-xs text-fog-300">Risk</p>
              <p className="font-bold text-ember">Pedestrian safety at night</p>
            </div>
          </div>
        </Panel>
      }
    />
  );
}

function RootCause({ featured }: { featured: HomeData["featured"] }) {
  const graph = featured?.graph ?? EXAMPLE_GRAPH;
  return (
    <Split
      text={
        <>
          <Kicker n="02" icon={<GitFork size={14} aria-hidden />}>
            Root cause graph
          </Kicker>
          <Title>
            <Words text={featured ? `${featured.reportCount} reports. One cause.` : "43 reports. One cause."} />
          </Title>
          <Lede>
            A normal system sees forty three complaints. UrbanTrace sees the drain they share. A civic causal graph links what
            people report to what produces it, so one coordinated case replaces dozens of duplicate tickets.
          </Lede>
          <Reveal delay={0.3} className="mt-8 flex flex-wrap items-center gap-3 text-sm font-bold">
            <span className="glass rounded-full px-4 py-2">{featured?.reportCount ?? 43} citizen reports</span>
            <ArrowRight size={16} className="text-fog-500" aria-hidden />
            <span className="glass rounded-full px-4 py-2">1 underlying problem</span>
            <ArrowRight size={16} className="text-fog-500" aria-hidden />
            <span className="rounded-full bg-violet/20 px-4 py-2 text-violet">1 coordinated case</span>
          </Reveal>
        </>
      }
      panel={
        <Panel tone="violet">
          <p className="kicker mb-2 text-violet">{featured ? featured.title : "Example incident"}</p>
          <RootCauseGraph graph={graph} />
          {featured && (
            <p className="num mt-2 text-xs text-fog-300">
              {featured.reportCount} reports within {Math.round(featured.radiusM)} m · confidence {Math.round(featured.confidence * 100)}%
            </p>
          )}
        </Panel>
      }
    />
  );
}

function Incidents() {
  return (
    <Split
      text={
        <>
          <Kicker n="03" icon={<Radar size={14} aria-hidden />}>
            Incident detection and alerts
          </Kicker>
          <Title>
            <Words text="Twenty five floods are one incident." />
          </Title>
          <Lede>
            Space-time clustering groups reports that are close, recent and causally related. When reports burst far above an
            area&apos;s normal rate, a Poisson test raises a civic alert, so the city acts before the next twenty arrive.
          </Lede>
        </>
      }
      panel={
        <div className="flex flex-col gap-4">
          <Panel tone="violet">
            <p className="flex items-center gap-2 text-sm font-extrabold tracking-wide text-violet uppercase">
              <Network size={16} aria-hidden /> Possible civic incident
            </p>
            <div className="num mt-4 grid grid-cols-3 gap-3 text-center">
              {[
                ["25", "reports"],
                ["640 m", "radius"],
                ["18 h", "window"],
              ].map(([v, l]) => (
                <div key={l} className="rounded-xl bg-white/5 py-3">
                  <p className="text-2xl font-semibold">{v}</p>
                  <p className="font-sans text-xs text-fog-300">{l}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm text-fog-200">
              Likely common cause: <span className="font-bold text-fog-50">drainage blockage</span>
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/8">
              <motion.div className="h-full origin-left rounded-full bg-violet" initial={{ scaleX: 0 }} whileInView={{ scaleX: 0.91 }} viewport={{ once: true }} transition={{ duration: 1.2, delay: 0.4 }} />
            </div>
            <p className="num mt-1.5 text-right text-xs text-fog-300">confidence 91%</p>
          </Panel>
          <Panel tone="siren" className="relative overflow-hidden">
            <span className="pulse-ring absolute top-6 right-6 size-3 rounded-full bg-siren" />
            <p className="flex items-center gap-2 text-sm font-extrabold tracking-wide text-siren uppercase">
              <Siren size={16} aria-hidden /> Civic alert
            </p>
            <p className="mt-2 font-display text-2xl font-bold">Possible localised flooding</p>
            <p className="num mt-2 text-sm text-fog-300">12 reports · 8 places · 45 minutes · ~0.7 km²</p>
          </Panel>
        </div>
      }
    />
  );
}

function Proof() {
  const checks = ["Location match", "Road segment match", "Same scene", "Issue disappeared", "Image timestamp"];
  return (
    <Split
      text={
        <>
          <Kicker n="04" icon={<BadgeCheck size={14} aria-hidden />}>
            Proof of fix
          </Kicker>
          <Title>
            <Words text="Closed only when the road says so." />
          </Title>
          <Lede>
            An after photo is not trusted on its own. GPS, road segment, scene layout, capture time and the model&apos;s before and
            after reading are checked separately, and a repair that leaves the drain blocked is only partially resolved.
          </Lede>
        </>
      }
      panel={
        <Panel tone="mint">
          <p className="kicker text-fog-300">Repair verification</p>
          <ul className="mt-4 flex flex-col gap-2.5">
            {checks.map((c, i) => (
              <motion.li key={c} className="flex items-center justify-between text-sm font-bold" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.3 + i * 0.22 }}>
                <span className="tracking-wide uppercase">{c}</span>
                <span className="flex size-6 items-center justify-center rounded-full bg-mint text-ink-950">✓</span>
              </motion.li>
            ))}
          </ul>
          <div className="mt-6 h-3 overflow-hidden rounded-full bg-white/8">
            <motion.div className="h-full origin-left bg-[linear-gradient(90deg,#35e0a1,#d9ff4a)]" initial={{ scaleX: 0 }} whileInView={{ scaleX: 0.89 }} viewport={{ once: true }} transition={{ duration: 1.4, delay: 1.4 }} />
          </div>
          <div className="mt-2 flex justify-between text-sm">
            <span className="text-fog-300">Potential issue: drain still blocked</span>
            <span className="num font-bold">89%</span>
          </div>
          <p className="mt-5 inline-flex rounded-full bg-amber px-3 py-1 text-xs font-extrabold text-ink-950">PARTIALLY RESOLVED</p>
        </Panel>
      }
    />
  );
}

function TimeMachine({ until, span }: { until: number | null; span: { from: number; to: number } | null }) {
  const months = [
    { m: "Jan", s: "normal" },
    { m: "Mar", s: "minor" },
    { m: "Jun", s: "problem" },
    { m: "Jul", s: "problem" },
    { m: "Aug", s: "repaired" },
    { m: "Sep", s: "problem" },
  ];
  const dot: Record<string, string> = { normal: "bg-mint", minor: "bg-amber", problem: "bg-ember", repaired: "bg-ion" };
  return (
    <div className="sticky top-24">
      <Split
        text={
          <>
            <Kicker n="05" icon={<History size={14} aria-hidden />}>
              Civic time machine
            </Kicker>
            <Title>
              <Words text="Why does it keep coming back?" />
            </Title>
            <Lede>
              Click any road and see its history: when the crack appeared, when it was patched, how long the repair lasted and
              whether heavy rain set it off again. Behind you, the city replays its reports as you scroll.
            </Lede>
            <Reveal delay={0.25}>
              <p className="glass num mt-8 inline-flex rounded-full px-4 py-2 text-sm">
                {until ? new Date(until).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : span ? "Scroll to replay" : "No history yet"}
              </p>
            </Reveal>
          </>
        }
        panel={
          <Panel tone="ion">
            <p className="kicker text-fog-300">80 Feet Road · example</p>
            <div className="relative mt-6 flex justify-between">
              <span className="absolute top-3 right-3 left-3 border-t-2 border-dotted border-white/20" />
              {months.map((x, i) => (
                <motion.div key={x.m} className="relative flex flex-col items-center gap-2" initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 + i * 0.15 }}>
                  <span className={`size-6 rounded-full border-4 border-ink-900 ${dot[x.s]}`} />
                  <span className="text-xs font-bold">{x.m}</span>
                </motion.div>
              ))}
            </div>
            <div className="mt-7 rounded-xl border border-ember/30 bg-ember/8 p-4">
              <p className="flex items-center gap-2 text-sm font-extrabold text-ember uppercase">⚠ Recurring issue</p>
              <div className="num mt-3 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xl font-semibold">42 d</p>
                  <p className="font-sans text-[11px] text-fog-300">repair lasted</p>
                </div>
                <div>
                  <p className="text-xl font-semibold">4</p>
                  <p className="font-sans text-[11px] text-fog-300">earlier repairs</p>
                </div>
                <div>
                  <p className="text-xl font-semibold">31 mm</p>
                  <p className="font-sans text-[11px] text-fog-300">rain before return</p>
                </div>
              </div>
              <p className="mt-3 text-sm text-fog-200">Likely systemic issue: drainage and road base degradation.</p>
            </div>
          </Panel>
        }
      />
    </div>
  );
}

function Priority() {
  const bars = [
    ["Safety risk", 0.95],
    ["Foot traffic", 0.8],
    ["Recurrence", 0.88],
    ["Evidence", 0.97],
    ["Accessibility", 0.7],
  ] as const;
  return (
    <Split
      text={
        <>
          <Kicker n="06" icon={<HardHat size={14} aria-hidden />}>
            Dynamic priority and assignment
          </Kicker>
          <Title>
            <Words text="Not the loudest. The most dangerous." />
          </Title>
          <Lede>
            Upvotes never decide alone. Safety, people affected, road use, accessibility, recurrence, evidence and recent
            worsening make a transparent score, and the assignment engine names the department, work type, crew and kit.
          </Lede>
        </>
      }
      panel={
        <div className="grid gap-4 sm:grid-cols-2">
          <Panel tone="ion">
            <p className="kicker text-fog-300">Priority signal</p>
            <ul className="mt-4 flex flex-col gap-3">
              {bars.map(([l, v], i) => (
                <li key={l}>
                  <div className="flex justify-between text-xs font-bold">
                    <span>{l}</span>
                    <span className="num text-fog-300">{Math.round(v * 100)}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/8">
                    <motion.div className="h-full origin-left rounded-full bg-[linear-gradient(90deg,#ff6a3d,#ffb547)]" initial={{ scaleX: 0 }} whileInView={{ scaleX: v }} viewport={{ once: true }} transition={{ duration: 0.9, delay: 0.2 + i * 0.12 }} />
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-fog-200">Reason: pedestrian hazard + repeated occurrence</p>
          </Panel>
          <Panel tone="cyan">
            <p className="kicker text-fog-300">Assignment</p>
            <p className="mt-3 font-display text-xl font-bold">Blocked storm drain</p>
            <dl className="mt-4 flex flex-col gap-3 text-sm">
              {[
                ["Department", "Storm Water Drains"],
                ["Work type", "Desilting"],
                ["Crew", "2 workers"],
                ["Equipment", "1 suction machine"],
                ["Estimate", "about 4 hours"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-white/6 pb-2">
                  <dt className="text-fog-300">{k}</dt>
                  <dd className="text-right font-bold">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-fog-500">Crew and hours are planning estimates.</p>
          </Panel>
        </div>
      }
    />
  );
}

function AccessVoice() {
  const langs = ["English", "हिन्दी", "ಕನ್ನಡ", "தமிழ்", "తెలుగు"];
  return (
    <Split
      text={
        <>
          <Kicker n="07" icon={<Accessibility size={14} aria-hidden />}>
            Accessibility and just talk
          </Kicker>
          <Title>
            <Words text="Say it in your language. Walk a clearer route." />
          </Title>
          <Lede>
            Press one button and talk in Kannada, Hindi, Tamil, Telugu or English. The model pulls out every problem, the place
            and the risk, then asks one thing: is this location right? Blocked footpaths feed an accessibility layer and walking
            routes with fewer obstacles.
          </Lede>
          <Reveal delay={0.3} className="mt-8 flex flex-wrap gap-2">
            {langs.map((l) => (
              <span key={l} className="glass rounded-full px-4 py-2 text-sm font-bold">
                {l}
              </span>
            ))}
          </Reveal>
        </>
      }
      panel={
        <div className="flex flex-col gap-4">
          <Panel tone="cyan">
            <p className="flex items-center gap-2 text-xs font-bold tracking-wide text-cyan uppercase">
              <Mic size={14} aria-hidden /> Voice note · Kannada
            </p>
            <p className="mt-3 text-lg leading-relaxed">
              <Typewriter text="ಬಸ್ ನಿಲ್ದಾಣದ ಬಳಿ ದೊಡ್ಡ ತೆರೆದ ಚರಂಡಿ ಇದೆ, ಸುತ್ತಲೂ ಕಸ, ರಾತ್ರಿ ದೀಪ ಇಲ್ಲ." />
            </p>
            <div className="mt-4 flex items-center gap-2 text-xs text-fog-300">
              <AudioLines size={14} aria-hidden /> Whisper, on our machine
            </div>
            <ul className="mt-4 grid grid-cols-3 gap-2 text-center text-xs font-bold">
              {["Open drain", "Garbage", "Streetlight"].map((x) => (
                <li key={x} className="rounded-lg bg-white/6 px-2 py-2">
                  {x}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-fog-200">Is this location correct? · Bus stop, 100 Feet Road</p>
          </Panel>
          <Panel tone="cyan">
            <p className="kicker text-fog-300">Accessibility layer</p>
            <div className="mt-3 flex flex-wrap gap-4 text-sm font-bold">
              <span className="flex items-center gap-2">
                <span className="size-3 rounded-full bg-mint" /> Accessible
              </span>
              <span className="flex items-center gap-2">
                <span className="size-3 rounded-full bg-amber" /> Partial obstruction
              </span>
              <span className="flex items-center gap-2">
                <span className="size-3 rounded-full bg-siren" /> Major obstruction
              </span>
            </div>
          </Panel>
        </div>
      }
    />
  );
}

function OpenJoin({ stats }: { stats: HomeData["stats"] }) {
  const stack = [
    ["Gemma 4", "Apache 2.0"],
    ["Whisper", "MIT"],
    ["nomic-embed", "Apache 2.0"],
    ["Depth Anything V2", "Apache 2.0"],
    ["Ollama", "MIT"],
    ["Next.js", "MIT"],
    ["MapLibre", "BSD-3"],
    ["deck.gl", "MIT"],
    ["Supabase", "Apache 2.0"],
    ["PostGIS", "GPL 2.0"],
    ["OpenStreetMap", "ODbL"],
    ["Open-Meteo", "CC BY 4.0"],
  ];
  return (
    <div className="flex flex-col gap-12">
      <div className="max-w-[880px]">
        <Kicker n="08" icon={<Cpu size={14} aria-hidden />}>
          Open at every layer
        </Kicker>
        <h2 className="font-display text-[48px] leading-[0.95] font-extrabold tracking-[-0.035em] sm:text-[80px]">
          <Words text="No paid AI. No vendor. Your city's" /> <span className="font-serif font-normal italic text-aurora">evidence.</span>
        </h2>
        <Lede>
          Every model runs on our own machine; photos are blurred before anyone sees them. Any residents&apos; association, campus or
          ward office can run all of it.
        </Lede>
      </div>
      <div className="overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_10%,#000_90%,transparent)]">
        <div className="marquee flex w-max gap-3">
          {[...stack, ...stack].map(([n, l], i) => (
            <span key={i} className="glass flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm">
              <span className="font-bold">{n}</span>
              <span className="num text-xs text-fog-300">{l}</span>
            </span>
          ))}
        </div>
      </div>
      <Reveal className="glass glow flex flex-col items-start justify-between gap-8 rounded-card p-8 md:flex-row md:items-end" y={30}>
        <div>
          <p className="font-display text-4xl font-extrabold tracking-[-0.03em] sm:text-5xl">Seen something broken today?</p>
          <p className="mt-3 text-fog-300">
            <CountTo value={stats.backers} className="text-fog-50" /> reports so far ·{" "}
            <CountTo value={stats.verified} className="text-mint" /> verified fixes
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/report" className="flex h-13 items-center gap-2 rounded-full bg-signal px-7 font-extrabold text-ink-950">
            <Video size={18} aria-hidden /> Report now
          </Link>
          <Link href="/impact" className="glass flex h-13 items-center gap-2 rounded-full px-7 font-bold">
            Your civic impact
          </Link>
        </div>
      </Reveal>
      <footer className="flex flex-col justify-between gap-4 border-t border-white/8 pt-8 text-sm text-fog-300 md:flex-row">
        <div>
          <p className="font-bold text-fog-50">Team {TEAM.name}</p>
          <p>{TEAM.members.join(" · ")}</p>
        </div>
        <ul className="flex flex-wrap gap-x-6 gap-y-2">
          {REPO_URL && (
            <li>
              <a href={REPO_URL} className="text-signal underline-offset-4 hover:underline">
                GitHub
              </a>
            </li>
          )}
          <li>{REPO_URL ? <a href={`${REPO_URL}/blob/main/LICENSE`} className="text-signal underline-offset-4 hover:underline">MIT licence</a> : "MIT licence"}</li>
          <li>Map data © OpenStreetMap contributors · tiles OpenFreeMap</li>
          <li>Weather data by Open-Meteo.com</li>
        </ul>
      </footer>
    </div>
  );
}
