import Image from "next/image";
import { CategoryChip } from "@/components/ui/CategoryChip";
import { SeverityMeter } from "@/components/ui/SeverityMeter";
import { StatusPill } from "@/components/ui/StatusPill";
import { PHOTO_BLUR } from "@/lib/blur";
import type { IssueProperties } from "@/lib/issues";

export function timeAgo(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes} m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

type IssueCardProps = {
  issue: IssueProperties;
  /** Linked to a hovered or selected map pin. */
  active?: boolean;
};

/** Photo at 16:10 with the status pill, category chip, two line summary, mono meta row, severity. */
export function IssueCard({ issue, active = false }: IssueCardProps) {
  return (
    <article
      className={`flex flex-col gap-3 rounded-card border panel-fill p-3 transition-transform duration-150 ease-out ${
        active ? "-translate-y-1 border-marking-400/30" : "border-white/6 hover:-translate-y-1 hover:border-marking-400/30"
      }`}
    >
      <div className="relative aspect-[16/10] overflow-hidden rounded-photo bg-asphalt-700">
        {issue.photoUrl && (
          <Image placeholder="blur" blurDataURL={PHOTO_BLUR} src={issue.photoUrl} alt="" fill sizes="(min-width: 768px) 360px, 100vw" className="object-cover" />
        )}
        <StatusPill status={issue.status} className="absolute top-2 left-2" />
      </div>
      <div className="flex flex-col gap-2 px-1">
        <div className="flex items-center justify-between gap-2">
          <CategoryChip category={issue.category} />
          <span className="font-mono text-xs text-mist-300">#{issue.id}</span>
        </div>
        <p className="line-clamp-2 text-sm">{issue.summary}</p>
        <p className="flex flex-wrap gap-x-3 font-mono text-xs text-mist-300">
          <span>
            <span className="text-chalk-50">{issue.backerCount}</span> {issue.backerCount === 1 ? "backer" : "backers"}
          </span>
          <span>{timeAgo(issue.createdAt)} ago</span>
        </p>
        <SeverityMeter value={issue.severity} />
      </div>
    </article>
  );
}
