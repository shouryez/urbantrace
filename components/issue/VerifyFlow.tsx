"use client";

import { motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { Camera } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { ScanLoader } from "@/components/motion/ScanLoader";
import { DatasetConsent } from "@/components/report/DatasetConsent";
import { Locate } from "@/components/report/Locate";
import { Button, buttonClasses } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { PHOTO_BLUR } from "@/lib/blur";
import type { LatLng } from "@/lib/geo";
import type { VerifyResult } from "@/lib/verify";

type VerifyFlowProps = {
  issueId: number;
  beforeUrl: string;
  /** F14: offer the dataset consent box; only when photos are blurred (F11). */
  offerConsent: boolean;
};

type Stage =
  | { kind: "capture" }
  | { kind: "locate" }
  | { kind: "checking" }
  | { kind: "error"; message: string }
  | { kind: "verdict"; result: VerifyResult };

/** F7: after photo of the same spot, its location, then the model's verdict. */
export function VerifyFlow({ issueId, beforeUrl, offerConsent }: VerifyFlowProps) {
  const reduce = useReducedMotion();
  const [stage, setStage] = useState<Stage>({ kind: "capture" });
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [position, setPosition] = useState<LatLng | null>(null);
  const [consent, setConsent] = useState(false);
  const urlRef = useRef<string | null>(null);
  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !file.type.startsWith("image/")) return;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = URL.createObjectURL(file);
    setPhoto(file);
    setPhotoUrl(urlRef.current);
    setStage({ kind: "locate" });
  };

  const check = async (file: File, at: LatLng) => {
    setStage({ kind: "checking" });
    const form = new FormData();
    form.set("photo", file);
    form.set("lat", String(at.lat));
    form.set("lng", String(at.lng));
    if (offerConsent && consent) form.set("consent", "1");
    try {
      const res = await fetch(`/api/issues/${issueId}/verify`, { method: "POST", body: form });
      const body = (await res.json()) as VerifyResult | { error: string };
      if (!res.ok || "error" in body) {
        setStage({ kind: "error", message: "error" in body ? body.error : "Could not check the photo." });
        return;
      }
      setStage({ kind: "verdict", result: body });
    } catch {
      setStage({ kind: "error", message: "Network error. Check your connection and try again." });
    }
  };

  const fileInput = (
    <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={onFile} />
  );

  if (stage.kind === "capture") {
    return (
      <div className="flex flex-col gap-5">
        <p className="text-mist-300">Stand where the original photo was taken and match its angle.</p>
        {/* The original photo, faded, as a guide to match the angle */}
        <div className="relative aspect-[4/3] overflow-hidden rounded-photo bg-asphalt-700">
          <Image placeholder="blur" blurDataURL={PHOTO_BLUR} src={beforeUrl} alt="Original photo" fill sizes="(min-width: 768px) 640px, 100vw" className="object-cover opacity-35" />
          <label className="absolute inset-0 m-auto flex size-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-full bg-marking-400 text-asphalt-950 transition-transform duration-150 ease-out focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-marking-400 active:scale-[0.97]">
            <Camera size={36} strokeWidth={1.75} aria-hidden />
            <span className="text-sm font-medium">Take after photo</span>
            {fileInput}
          </label>
        </div>
        {offerConsent && <DatasetConsent checked={consent} onChange={setConsent} />}
      </div>
    );
  }

  if (stage.kind === "locate") {
    return <Locate onConfirm={(at) => { setPosition(at); if (photo) void check(photo, at); }} onBack={() => setStage({ kind: "capture" })} />;
  }

  const sideBySide = (
    <div className="grid grid-cols-2 gap-3">
      <ScanLoader active={stage.kind === "checking"} className="aspect-[4/5]">
        <Image placeholder="blur" blurDataURL={PHOTO_BLUR} src={beforeUrl} alt="Before" fill sizes="50vw" className="object-cover" />
      </ScanLoader>
      <ScanLoader active={stage.kind === "checking"} className="aspect-[4/5]">
        {/* A blob: URL from the camera, so next/image does not apply here. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {photoUrl && <img src={photoUrl} alt="After" className="h-full w-full object-cover" />}
      </ScanLoader>
    </div>
  );

  const flip = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.15 } }
    : { initial: { opacity: 0, rotateX: 80 }, animate: { opacity: 1, rotateX: 0 }, transition: { type: "spring" as const, stiffness: 400, damping: 22 } };

  return (
    <div className="flex flex-col gap-5">
      {sideBySide}
      {stage.kind === "checking" && (
        <p className="text-sm text-mist-300" aria-live="polite">
          Comparing the photos…
        </p>
      )}
      {stage.kind === "error" && (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-sm text-chalk-50">{stage.message}</p>
          <div className="flex gap-3">
            {photo && position && <Button onClick={() => void check(photo, position)}>Try again</Button>}
            <Link href={`/issue/${issueId}`} className={buttonClasses("ghost")}>
              Back to issue
            </Link>
          </div>
        </div>
      )}
      {stage.kind === "verdict" && (
        <div style={{ perspective: 800 }}>
          <motion.div
            {...flip}
            className={`flex flex-col gap-3 rounded-card border-2 bg-asphalt-800 p-5 ${stage.result.passed ? "border-verified-500" : "border-alert-500"}`}
          >
            {/* the pill starts as "Fix claimed" (yellow) and crossfades to the result over 300 ms */}
            <div className="relative h-7">
              {!reduce && (
                <motion.span
                  className="absolute inset-0"
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: 0.3, delay: 0.35 }}
                >
                  <StatusPill status="fix_claimed" />
                </motion.span>
              )}
              <motion.span
                className="absolute inset-0"
                initial={{ opacity: reduce ? 1 : 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.35 }}
              >
                <StatusPill status={stage.result.passed ? "verified" : "open"} />
              </motion.span>
            </div>
            <h2 className="font-display text-[32px] leading-tight font-semibold">
              {stage.result.passed ? "Verified fixed" : "Not verified yet"}
            </h2>
            <p className="text-mist-300">{stage.result.reason}</p>
            <p className="font-mono text-xs text-mist-300">
              {stage.result.distanceM} m from the issue · confidence {stage.result.confidence}
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              {!stage.result.passed && (
                <label className={buttonClasses("primary", "cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-marking-400")}>
                  Retake photo
                  {fileInput}
                </label>
              )}
              <Link href={`/issue/${issueId}`} className={buttonClasses(stage.result.passed ? "primary" : "secondary")}>
                Back to issue
              </Link>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
