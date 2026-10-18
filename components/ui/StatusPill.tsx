import { BadgeCheck, CircleAlert, Hourglass, type LucideIcon } from "lucide-react";
import type { Status } from "@/lib/ai/schemas";

// Every status carries a word and an icon, never colour alone.
const STATUS_STYLE: Record<Status, { label: string; Icon: LucideIcon; className: string }> = {
  open: { label: "Open", Icon: CircleAlert, className: "bg-alert-500" },
  fix_claimed: { label: "Fix claimed", Icon: Hourglass, className: "bg-marking-400" },
  verified: { label: "Verified", Icon: BadgeCheck, className: "bg-verified-500" },
};

type StatusPillProps = {
  status: Status;
  className?: string;
};

export function StatusPill({ status, className = "" }: StatusPillProps) {
  const { label, Icon, className: colour } = STATUS_STYLE[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-asphalt-950 ${colour} ${className}`.trim()}
    >
      <Icon size={14} strokeWidth={1.75} aria-hidden />
      {label}
    </span>
  );
}
