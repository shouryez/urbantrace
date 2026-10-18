"use client";

// Root cause graph (feature 2): the likely cause at the top, what it produces below, and
// contributing problems (like garbage choking a drain) feeding into it. Edges draw in along the
// causal paths; observed problems show how many reports they have.
import { motion } from "motion/react";
import { useMemo } from "react";
import { useReducedMotionSafe } from "@/components/motion/useReducedMotionSafe";

export type GraphInput = {
  nodes: { id: string; label: string; observed: number; root: boolean }[];
  edges: { from: string; to: string; strength: number; why: string }[];
};

const W = 640;
const ROW = 118;

export function RootCauseGraph({ graph, className = "" }: { graph: GraphInput; className?: string }) {
  const reduce = useReducedMotionSafe();

  const layout = useMemo(() => {
    const root = graph.nodes.find((n) => n.root) ?? graph.nodes[0];
    if (!root) return null;
    // Depth: downstream of the root goes down, upstream contributors go up one row.
    const depth = new Map<string, number>([[root.id, 0]]);
    let changed = true;
    for (let guard = 0; changed && guard < 12; guard++) {
      changed = false;
      for (const e of graph.edges) {
        if (depth.has(e.from) && !depth.has(e.to)) {
          depth.set(e.to, depth.get(e.from)! + 1);
          changed = true;
        } else if (depth.has(e.to) && !depth.has(e.from)) {
          depth.set(e.from, depth.get(e.to)! - 1);
          changed = true;
        }
      }
    }
    for (const n of graph.nodes) if (!depth.has(n.id)) depth.set(n.id, 1);
    const min = Math.min(...depth.values());
    const rows = new Map<number, string[]>();
    for (const n of graph.nodes) {
      const d = depth.get(n.id)! - min;
      rows.set(d, [...(rows.get(d) ?? []), n.id]);
    }
    const pos = new Map<string, { x: number; y: number }>();
    for (const [d, ids] of rows) ids.forEach((id, i) => pos.set(id, { x: ((i + 1) * W) / (ids.length + 1), y: 46 + d * ROW }));
    const height = 46 + Math.max(...rows.keys()) * ROW + 54;
    return { pos, height, rootId: root.id };
  }, [graph]);

  if (!layout) return null;
  const { pos, height, rootId } = layout;

  return (
    <svg viewBox={`0 0 ${W} ${height}`} className={`h-auto w-full ${className}`} role="img" aria-label={`Root cause graph. Likely root cause: ${graph.nodes.find((n) => n.id === rootId)?.label}`}>
      <defs>
        <marker id="rcg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="#a78bfa" />
        </marker>
        <radialGradient id="rcg-root" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
        </radialGradient>
      </defs>
      {graph.edges.map((e, i) => {
        const a = pos.get(e.from), b = pos.get(e.to);
        if (!a || !b) return null;
        const mid = (a.y + b.y) / 2;
        const d = `M${a.x} ${a.y + 22} C ${a.x} ${mid}, ${b.x} ${mid}, ${b.x} ${b.y - 24}`;
        return (
          <g key={`${e.from}-${e.to}`}>
            <motion.path
              d={d}
              fill="none"
              stroke="#a78bfa"
              strokeOpacity={0.35 + e.strength * 0.5}
              strokeWidth={1.5 + e.strength * 2}
              strokeDasharray="0 1"
              markerEnd="url(#rcg-arrow)"
              initial={{ pathLength: reduce ? 1 : 0, opacity: reduce ? 1 : 0 }}
              whileInView={{ pathLength: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: reduce ? 0 : 0.9, delay: reduce ? 0 : 0.4 + i * 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <title>{e.why}</title>
            </motion.path>
          </g>
        );
      })}
      {graph.nodes.map((n, i) => {
        const p = pos.get(n.id)!;
        const isRoot = n.id === rootId;
        const width = Math.max(120, n.label.length * 8.4 + (n.observed ? 46 : 28));
        return (
          <motion.g
            key={n.id}
            initial={{ opacity: 0, scale: reduce ? 1 : 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: reduce ? 0.15 : 0.5, delay: reduce ? 0 : i * 0.12, ease: [0.22, 1, 0.36, 1] }}
            style={{ transformOrigin: `${p.x}px ${p.y}px` }}
          >
            {isRoot && <circle cx={p.x} cy={p.y} r={70} fill="url(#rcg-root)" />}
            <rect
              x={p.x - width / 2}
              y={p.y - 20}
              width={width}
              height={40}
              rx={20}
              fill={isRoot ? "#2a1f4d" : n.observed ? "#2a1a17" : "#131a27"}
              stroke={isRoot ? "#a78bfa" : n.observed ? "#ff6a3d" : "#2b3649"}
              strokeWidth={isRoot ? 2 : 1.25}
            />
            <text x={p.x - (n.observed ? 14 : 0)} y={p.y + 5} textAnchor="middle" fontSize="14" fontWeight="700" fill={isRoot ? "#e4dcff" : "#eef2f8"} fontFamily="var(--font-manrope)">
              {n.label.toUpperCase()}
            </text>
            {n.observed > 0 && (
              <text x={p.x + width / 2 - 22} y={p.y + 5} textAnchor="middle" fontSize="13" fontWeight="600" fill="#ff9a7a" fontFamily="var(--font-jetbrains)">
                {n.observed}
              </text>
            )}
            {isRoot && (
              <text x={p.x} y={p.y - 30} textAnchor="middle" fontSize="11" letterSpacing="2.2" fontWeight="700" fill="#a78bfa" fontFamily="var(--font-manrope)">
                LIKELY ROOT CAUSE
              </text>
            )}
          </motion.g>
        );
      })}
    </svg>
  );
}
