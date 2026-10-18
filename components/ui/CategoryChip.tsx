import {
  CircleQuestionMark,
  Droplets,
  Footprints,
  Waves,
  Lightbulb,
  TrafficCone,
  Trash,
  WavesHorizontal,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { CATEGORY_LABELS as L, type Category } from "@/lib/ai/schemas";

export const CATEGORY_META: Record<Category, { label: string; Icon: LucideIcon }> = {
  pothole: { label: L.pothole, Icon: TrafficCone },
  garbage: { label: L.garbage, Icon: Trash },
  streetlight: { label: L.streetlight, Icon: Lightbulb },
  waterlogging: { label: L.waterlogging, Icon: WavesHorizontal },
  drainage: { label: L.drainage, Icon: Waves },
  footpath: { label: L.footpath, Icon: Footprints },
  water_leak_sewage: { label: L.water_leak_sewage, Icon: Droplets },
  power_hazard: { label: L.power_hazard, Icon: Zap },
  other: { label: L.other, Icon: CircleQuestionMark },
};

type CategoryChipProps = {
  category: Category;
  selected?: boolean;
  /** When set, the chip renders as a toggle button. */
  onSelect?: (category: Category) => void;
  className?: string;
};

export function CategoryChip({ category, selected = false, onSelect, className = "" }: CategoryChipProps) {
  const { label, Icon } = CATEGORY_META[category];
  const classes =
    "inline-flex items-center gap-1.5 rounded-full border bg-asphalt-700 px-3 py-1.5 text-sm font-medium text-chalk-50 " +
    (selected ? "border-marking-400" : "border-white/6") +
    (onSelect ? " transition-transform duration-150 ease-out active:scale-[0.97]" : "") +
    (className ? ` ${className}` : "");
  const content = (
    <>
      <Icon size={16} strokeWidth={1.75} aria-hidden />
      {label}
    </>
  );

  if (!onSelect) return <span className={classes}>{content}</span>;
  return (
    <button type="button" aria-pressed={selected} className={classes} onClick={() => onSelect(category)}>
      {content}
    </button>
  );
}
