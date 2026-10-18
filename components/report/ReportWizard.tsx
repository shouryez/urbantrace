"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ScanLoader } from "@/components/motion/ScanLoader";
import { Button } from "@/components/ui/Button";
import { getDeviceId } from "@/lib/device";
import type { LatLng } from "@/lib/geo";
import type { AnalyzeResult, NearbyIssue, SubmitBody, SubmitResult } from "@/lib/reports";
import { Capture } from "./Capture";
import { Done } from "./Done";
import { Locate } from "./Locate";
import { ResultCard, type ReportValues } from "./ResultCard";
import { SameProblem } from "./SameProblem";
import { StepTrace } from "./StepTrace";
import { VoiceNote } from "./VoiceNote";

const STEPS = ["Capture", "Locate", "AI reading", "Same problem?", "Done"] as const;
type Step = 0 | 1 | 2 | 3 | 4;

type Analysis =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; result: AnalyzeResult };

async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    return typeof body.error === "string" ? body.error : fallback;
  } catch {
    return fallback;
  }
}

type ReportWizardProps = {
  /** From "I see this too" on an issue page: back this issue, if the report is within 30 m. */
  targetId: number | null;
  /** The model service is configured: voice notes can be transcribed (F9) and photos are blurred (F11). */
  mlOn: boolean;
};

export function ReportWizard({ targetId, mlOn }: ReportWizardProps) {
  const reduce = useReducedMotion();
  const [step, setStep] = useState<Step>(0);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [position, setPosition] = useState<LatLng | null>(null);
  const [analysis, setAnalysis] = useState<Analysis>({ state: "idle" });
  // similar: matched by meaning (F12) rather than by category within 30 m (F4).
  const [pending, setPending] = useState<{ values: ReportValues; match: NearbyIssue; similar: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);
  // Set once the user has been told they are too far from the target issue.
  const [ignoreTarget, setIgnoreTarget] = useState(false);

  // Revoke the preview's object URL when it is replaced or the page closes.
  const urlRef = useRef<string | null>(null);
  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  const handleCapture = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setCaptureError("That file is not a photo.");
      return;
    }
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = URL.createObjectURL(file);
    setCaptureError(null);
    setPhoto(file);
    setPhotoUrl(urlRef.current);
  };

  const analyze = async (file: File, at: LatLng) => {
    setAnalysis({ state: "loading" });
    const form = new FormData();
    form.set("photo", file);
    form.set("lat", String(at.lat));
    form.set("lng", String(at.lng));
    if (transcript.trim()) form.set("transcript", transcript.trim());
    try {
      const res = await fetch("/api/reports/analyze", { method: "POST", body: form });
      if (!res.ok) {
        setAnalysis({ state: "error", message: await errorMessage(res, "Could not upload the photo.") });
        return;
      }
      setAnalysis({ state: "ready", result: (await res.json()) as AnalyzeResult });
    } catch {
      setAnalysis({ state: "error", message: "Network error. Check your connection and try again." });
    }
  };

  const handleLocate = (at: LatLng) => {
    if (!photo) return;
    setPosition(at);
    setStep(2);
    void analyze(photo, at);
  };

  const submit = async (values: ReportValues, choice: { forceNew?: boolean; targetIssueId?: number } = {}) => {
    if (analysis.state !== "ready" || !position) return;
    setSubmitting(true);
    setSubmitError(null);
    const body: SubmitBody = {
      ...position,
      photoPath: analysis.result.photoPath,
      category: values.category,
      severity: values.severity,
      summary: values.summary,
      ai: analysis.result.reading,
      userEdited: values.userEdited,
      deviceId: getDeviceId(),
      corporationId: values.corporationId,
      transcript: transcript.trim() || null,
      depthClass: values.category === "pothole" ? values.depthClass : null,
      datasetConsent: values.datasetConsent,
      forceNew: choice.forceNew ?? false,
      targetIssueId: choice.targetIssueId ?? null,
    };
    try {
      const res = await fetch("/api/reports/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setSubmitError(await errorMessage(res, "Could not file the report."));
        return;
      }
      setResult((await res.json()) as SubmitResult);
      setStep(4);
    } catch {
      setSubmitError("Network error. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // After the result card: show "Same problem?" when an unverified issue within 30 m matches.
  const handleValues = (values: ReportValues) => {
    if (analysis.state !== "ready") return;
    const { nearby, similar } = analysis.result;
    const target = targetId !== null && !ignoreTarget ? targetId : null;
    const sameCategory = target !== null ? nearby.find((n) => n.id === target) : nearby.find((n) => n.category === values.category);
    if (target !== null && !sameCategory) {
      setIgnoreTarget(true);
      setSubmitError(`You are more than 30 m from issue #${target}. Tap File report again to file this as a new report.`);
      return;
    }
    // F12: no same-category match, but an issue nearby means nearly the same thing.
    const bySense = target === null && !sameCategory ? similar.find((n) => n.category !== values.category) : undefined;
    const match = sameCategory ?? bySense;
    if (match) {
      setPending({ values, match, similar: !sameCategory });
      setSubmitError(null);
      setStep(3);
      return;
    }
    void submit(values);
  };

  const reset = () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setPhoto(null);
    setPhotoUrl(null);
    setTranscript("");
    setPosition(null);
    setAnalysis({ state: "idle" });
    setPending(null);
    setSubmitError(null);
    setResult(null);
    setStep(0);
  };

  const transition = reduce ? { duration: 0.15 } : { duration: 0.3, ease: [0.22, 1, 0.36, 1] as const };
  const offset = reduce ? 0 : 24;

  return (
    <div className="flex flex-col gap-8">
      <StepTrace steps={STEPS} current={step} />
      {targetId !== null && step < 4 && (
        <p className="text-sm text-mist-300">
          Backing issue <span className="font-mono text-chalk-50">#{targetId}</span>: take a photo of it from where you stand.
        </p>
      )}
      <AnimatePresence mode="wait" initial={false}>
        <motion.section
          key={step}
          initial={{ opacity: 0, x: offset }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -offset }}
          transition={transition}
        >
          {step === 0 && (
            <Capture
              photoUrl={photoUrl}
              error={captureError}
              onCapture={handleCapture}
              onNext={() => setStep(1)}
              voiceNote={mlOn ? <VoiceNote value={transcript} onChange={setTranscript} /> : null}
            />
          )}
          {step === 1 && <Locate onConfirm={handleLocate} onBack={() => setStep(0)} />}
          {step === 2 && photoUrl && (
            <div className="flex flex-col gap-5">
              <ScanLoader active={analysis.state === "loading"}>
                {/* A blob: URL from the camera, so next/image does not apply here. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoUrl} alt="Your photo" className="max-h-[40vh] w-full object-cover" />
              </ScanLoader>
              {analysis.state === "loading" && (
                <p className="text-sm text-mist-300" aria-live="polite">
                  Reading the photo…
                </p>
              )}
              {analysis.state === "error" && (
                <div className="flex flex-col items-start gap-3" role="alert">
                  <p className="text-sm text-chalk-50">{analysis.message}</p>
                  <Button onClick={() => photo && position && void analyze(photo, position)}>Try again</Button>
                </div>
              )}
              {analysis.state === "ready" && (
                <ResultCard
                  reading={analysis.result.reading}
                  address={analysis.result.address}
                  askCorporation={analysis.result.corporationId === null}
                  depthClass={analysis.result.depthClass}
                  offerConsent={mlOn}
                  submitting={submitting}
                  error={submitError}
                  onSubmit={handleValues}
                  onRetake={() => {
                    setAnalysis({ state: "idle" });
                    setStep(0);
                  }}
                />
              )}
            </div>
          )}
          {step === 3 && pending && photoUrl && (
            <SameProblem
              match={pending.match}
              similar={pending.similar}
              photoUrl={photoUrl}
              submitting={submitting}
              error={submitError}
              onSame={() => void submit(pending.values, { targetIssueId: pending.match.id })}
              onDifferent={() => void submit(pending.values, { forceNew: true })}
            />
          )}
          {step === 4 && result && position && <Done result={result} position={position} onAnother={reset} />}
        </motion.section>
      </AnimatePresence>
    </div>
  );
}
