"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";

export const SEVERITY_LABELS = [
  "Cosmetic",
  "Minor inconvenience",
  "Slows traffic or walking",
  "Risk of injury or damage",
  "Immediate danger",
] as const;

type SeverityMeterProps = {
  value: number;
  /** When set, the meter is a slider: drag, tap or use the arrow keys. */
  onChange?: (value: number) => void;
  className?: string;
};

const clamp = (v: number) => Math.min(5, Math.max(1, v));

/** Five lane dash segments; filled ones are yellow, turning orange at 4 and 5. */
export function SeverityMeter({ value, onChange, className = "" }: SeverityMeterProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const label = SEVERITY_LABELS[clamp(value) - 1];
  const fill = value >= 4 ? "bg-alert-500" : "bg-marking-400";

  const segments = (
    <div ref={trackRef} className="flex flex-1 gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={`h-2 flex-1 rounded-full ${n <= value ? fill : "bg-asphalt-700"}`} />
      ))}
    </div>
  );
  const readout = (
    <span className="shrink-0 text-sm text-mist-300">
      <span className="font-mono text-chalk-50">{value}/5</span> {label}
    </span>
  );

  if (!onChange) {
    return (
      <div className={`flex items-center gap-3 ${className}`.trim()} aria-label={`Severity ${value} of 5, ${label}`} role="img">
        {segments}
        {readout}
      </div>
    );
  }

  const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    onChange(clamp(Math.ceil(((e.clientX - rect.left) / rect.width) * 5)));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const next =
      e.key === "ArrowRight" || e.key === "ArrowUp" ? value + 1
      : e.key === "ArrowLeft" || e.key === "ArrowDown" ? value - 1
      : e.key === "Home" ? 1
      : e.key === "End" ? 5
      : null;
    if (next === null) return;
    e.preventDefault();
    onChange(clamp(next));
  };

  return (
    <div className={`flex flex-col gap-2 ${className}`.trim()}>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Severity"
        aria-valuemin={1}
        aria-valuemax={5}
        aria-valuenow={value}
        aria-valuetext={`${value} of 5, ${label}`}
        className="flex cursor-pointer touch-none items-center py-3"
        onKeyDown={onKeyDown}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          fromPointer(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e);
        }}
      >
        {segments}
      </div>
      {readout}
    </div>
  );
}
