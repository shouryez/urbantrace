"use client";

import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { CategoryChip } from "@/components/ui/CategoryChip";
import { SeverityMeter } from "@/components/ui/SeverityMeter";
import { CATEGORIES, type Category, type PhotoReading } from "@/lib/ai/schemas";
import { DEPTH_CLASSES, type DepthClass } from "@/lib/reports";
import { DatasetConsent } from "./DatasetConsent";
import { agencyFor, CORPORATION_IDS, CORPORATION_NAMES, type CorporationId } from "@/lib/routing";

export type ReportValues = {
  category: Category;
  severity: number;
  summary: string;
  userEdited: boolean;
  /** The user's pick when the boundary lookup found no corporation (F5). */
  corporationId: CorporationId | null;
  /** F13: estimated pothole depth, as corrected by the user; null for "not sure". */
  depthClass: DepthClass | null;
  /** F14: the reporter allowed this blurred photo in the open dataset. */
  datasetConsent: boolean;
};

type ResultCardProps = {
  reading: PhotoReading | null;
  address: string | null;
  /** No corporation boundary covers the point, so ask the user for corporation issues. */
  askCorporation: boolean;
  /** F13: estimated depth from the model service; the field shows only for potholes when there is one. */
  depthClass: DepthClass | null;
  /** F14: offer the dataset consent box; only when photos are blurred (F11). */
  offerConsent: boolean;
  submitting: boolean;
  error: string | null;
  onSubmit: (values: ReportValues) => void;
  onRetake: () => void;
};

/** The AI reading, all of it editable (F2). With no reading, the user fills it in by hand. */
export function ResultCard({
  reading,
  address,
  askCorporation,
  depthClass,
  offerConsent,
  submitting,
  error,
  onSubmit,
  onRetake,
}: ResultCardProps) {
  const reduce = useReducedMotion();
  const [category, setCategory] = useState<Category | null>(reading?.category ?? null);
  const [severity, setSeverity] = useState(reading?.severity ?? 3);
  const [summary, setSummary] = useState(reading?.summary ?? "");
  const [corporationId, setCorporationId] = useState<CorporationId | null>(null);
  const [depth, setDepth] = useState<DepthClass | null>(depthClass);
  const [consent, setConsent] = useState(false);

  const enter = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.15 } }
    : {
        initial: { opacity: 0, y: 40 },
        animate: { opacity: 1, y: 0 },
        transition: { type: "spring" as const, stiffness: 400, damping: 22 },
      };

  if (reading && !reading.is_civic_issue) {
    return (
      <motion.div {...enter} className="flex flex-col gap-4 rounded-card panel p-5">
        <h2 className="font-display text-[22px] font-semibold">This doesn&apos;t look like a street problem</h2>
        <p className="text-sm text-mist-300">
          The model saw: <span className="text-chalk-50">{reading.summary}</span>
        </p>
        <p className="text-sm text-mist-300">Take a clear photo of the problem itself, outdoors, and try again.</p>
        <div>
          <Button onClick={onRetake}>Retake photo</Button>
        </div>
      </motion.div>
    );
  }

  const trimmed = summary.trim();
  const userEdited =
    !reading || category !== reading.category || severity !== reading.severity || trimmed !== reading.summary;
  const canSubmit = category !== null && trimmed.length > 0 && !submitting;
  const showCorporation = askCorporation && category !== null && agencyFor(category) === "corporation";
  const showDepth = category === "pothole" && depthClass !== null;

  return (
    <motion.form
      {...enter}
      className="flex flex-col gap-5 rounded-card panel p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (category && canSubmit) {
          const corp = showCorporation ? corporationId : null;
          onSubmit({ category, severity, summary: trimmed, userEdited, corporationId: corp, depthClass: showDepth ? depth : null, datasetConsent: offerConsent && consent });
        }
      }}
    >
      <div className="flex flex-col gap-1">
        <p className="kicker text-mist-300">{reading ? "AI reading · tap to correct" : "Fill in the details"}</p>
        {!reading && (
          <p className="text-sm text-mist-300">The model couldn&apos;t read this photo, so pick the category yourself.</p>
        )}
        <p className="text-sm text-mist-300">{address ?? "Address not found, the pin location will be used."}</p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Category</legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <CategoryChip key={c} category={c} selected={c === category} onSelect={setCategory} />
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">Severity</span>
        <SeverityMeter value={severity} onChange={setSeverity} />
      </div>

      <label className="flex flex-col gap-2">
        <span className="flex items-baseline justify-between text-sm font-medium">
          Summary
          <span className="font-mono text-xs text-mist-300">{summary.length}/120</span>
        </span>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          maxLength={120}
          rows={3}
          required
          className="resize-none rounded-[14px] border border-white/6 bg-asphalt-700 px-4 py-3 text-chalk-50 placeholder:text-mist-300"
          placeholder="One sentence a city engineer could act on"
        />
      </label>

      {showDepth && (
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">
            Depth <span className="font-normal text-mist-300">(estimated from the photo)</span>
          </span>
          <select
            value={depth ?? ""}
            onChange={(e) => setDepth((e.target.value || null) as DepthClass | null)}
            className="rounded-[14px] border border-white/6 bg-asphalt-700 px-4 py-3 text-chalk-50"
          >
            {DEPTH_CLASSES.map((d) => (
              <option key={d} value={d}>
                {d[0]!.toUpperCase() + d.slice(1)}
              </option>
            ))}
            <option value="">Not sure</option>
          </select>
        </label>
      )}

      {showCorporation && (
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">Which city corporation is this in?</span>
          <select
            value={corporationId ?? ""}
            onChange={(e) => setCorporationId((e.target.value || null) as CorporationId | null)}
            className="rounded-[14px] border border-white/6 bg-asphalt-700 px-4 py-3 text-chalk-50"
          >
            <option value="">Not sure</option>
            {CORPORATION_IDS.map((c) => (
              <option key={c} value={c}>
                {CORPORATION_NAMES[c]}
              </option>
            ))}
          </select>
        </label>
      )}

      {offerConsent && <DatasetConsent checked={consent} onChange={setConsent} />}

      {error && (
        <p role="alert" className="text-sm text-chalk-50">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={!canSubmit}>
          {submitting ? "Filing…" : "File report"}
        </Button>
        <Button variant="ghost" onClick={onRetake} disabled={submitting}>
          Retake photo
        </Button>
      </div>
    </motion.form>
  );
}
