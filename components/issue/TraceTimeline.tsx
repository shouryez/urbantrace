"use client";

import { motion } from "motion/react";
import { BadgeCheck, Camera, CircleX, Hourglass, Send, Users, type LucideIcon } from "lucide-react";
import { useReducedMotionSafe } from "@/components/motion/useReducedMotionSafe";
import type { IssueEvent } from "@/lib/issue-detail";

const KIND: Record<IssueEvent["kind"], { label: string; Icon: LucideIcon; node: string }> = {
  reported: { label: "Reported", Icon: Camera, node: "bg-marking-400 text-asphalt-950" },
  merged: { label: "Merged", Icon: Users, node: "bg-marking-400 text-asphalt-950" },
  routed: { label: "Routed", Icon: Send, node: "bg-marking-400 text-asphalt-950" },
  fix_claimed: { label: "Fix claimed", Icon: Hourglass, node: "bg-marking-400 text-asphalt-950" },
  verified: { label: "Verified", Icon: BadgeCheck, node: "bg-verified-500 text-asphalt-950" },
  verification_failed: { label: "Not verified", Icon: CircleX, node: "bg-alert-500 text-asphalt-950" },
};

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

function text(detail: IssueEvent["detail"], key: string): string | null {
  const v = detail?.[key];
  return typeof v === "string" ? v : null;
}

/** F8: the issue trail, oldest first, on a vertical dotted trace. Nodes fill one after another on first view. */
export function TraceTimeline({ events }: { events: IssueEvent[] }) {
  const reduce = useReducedMotionSafe();
  // Running backer count after each event: the first report and each merge add one.
  const backersAt = events.reduce<number[]>((acc, e) => {
    const prev = acc.at(-1) ?? 0;
    acc.push(e.kind === "reported" || e.kind === "merged" ? prev + 1 : prev);
    return acc;
  }, []);
  return (
    <motion.ol
      key={reduce ? "reduced" : "full"}
      className="relative flex flex-col gap-6 pl-2"
      initial="empty"
      whileInView="filled"
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
    >
      <span aria-hidden className="absolute top-3 bottom-3 left-[23px] border-l-[3px] border-dotted border-asphalt-700" />
      {events.map((e, i) => {
        const { label, Icon, node } = KIND[e.kind];
        const note =
          e.kind === "merged" ? `Backers: ${backersAt[i] ?? 0}`
          : e.kind === "routed" ? text(e.detail, "body")
          : e.kind === "verification_failed" || e.kind === "verified" ? text(e.detail, "reason")
          : null;
        return (
          <li key={e.id} className="relative flex gap-4">
            <span className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-asphalt-700 text-mist-300">
              <motion.span
                className={`absolute inset-0 flex items-center justify-center rounded-full ${node}`}
                variants={
                  reduce
                    ? { empty: { opacity: 0 }, filled: { opacity: 1, transition: { duration: 0.15 } } }
                    : {
                        empty: { scale: 0, opacity: 0 },
                        filled: { scale: 1, opacity: 1, transition: { type: "spring", stiffness: 400, damping: 22, delay: i * 0.12 } },
                      }
                }
              >
                <Icon size={16} strokeWidth={1.75} aria-hidden />
              </motion.span>
            </span>
            <div className="flex flex-col gap-0.5 pt-1">
              <p className="font-medium">
                {label} <span className="ml-2 font-mono text-xs text-mist-300">{when(e.createdAt)}</span>
              </p>
              {note && <p className={`text-sm text-mist-300 ${e.kind === "merged" ? "font-mono" : ""}`}>{note}</p>}
            </div>
          </li>
        );
      })}
    </motion.ol>
  );
}
