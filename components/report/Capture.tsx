"use client";

import { Accessibility, Camera, Languages, ScanSearch } from "lucide-react";
import type { ChangeEvent, ReactNode } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";

type CaptureProps = {
  photoUrl: string | null;
  error: string | null;
  onCapture: (file: File) => void;
  onNext: () => void;
  /** F9: the optional voice note, shown under the photo preview. */
  voiceNote: ReactNode;
};

const HINTS = [
  { Icon: ScanSearch, label: "Finds every problem in the scene" },
  { Icon: Accessibility, label: "Flags accessibility hazards" },
  { Icon: Languages, label: "Speak in any language" },
];

export function Capture({ photoUrl, error, onCapture, onNext, voiceNote }: CaptureProps) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onCapture(file);
    e.target.value = ""; // allow picking the same file again after a retake
  };

  // capture="environment" opens the rear camera on phones, with no app install.
  const fileInput = (
    <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={handleChange} />
  );

  if (!photoUrl) {
    return (
      <div className="flex flex-col items-center gap-7 py-8 text-center">
        <h2 className="font-display text-[36px] leading-[1.05] font-bold tracking-tight md:text-[44px]">
          <span className="text-aurora">Snap the</span> <span className="font-serif font-normal italic">problem</span>
        </h2>
        <p className="max-w-sm text-fog-300">A pothole, a garbage pile, a dead streetlight. One clear photo is enough; the AI does the paperwork.</p>
        <label className="relative my-6 flex size-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-full bg-signal text-ink-950 shadow-[0_18px_60px_-12px_#d9ff4a] transition-transform duration-150 ease-out focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-signal hover:-translate-y-0.5 active:scale-[0.97]">
          <span aria-hidden className="pulse-ring absolute inset-0 rounded-full border-2 border-signal" />
          <Camera size={42} strokeWidth={1.75} aria-hidden />
          <span className="text-sm font-extrabold">Take photo</span>
          {fileInput}
        </label>
        <ul className="flex flex-wrap justify-center gap-2 text-xs text-fog-200">
          {HINTS.map(({ Icon, label }) => (
            <li key={label} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
              <Icon size={13} aria-hidden /> {label}
            </li>
          ))}
        </ul>
        {error && (
          <p role="alert" className="text-sm text-chalk-50">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* A blob: URL from the camera, so next/image does not apply here. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photoUrl} alt="Your photo" className="max-h-[60vh] w-full rounded-photo object-cover" />
      {voiceNote}
      <div className="flex flex-wrap gap-3">
        <Button onClick={onNext}>Use photo</Button>
        <label className={buttonClasses("secondary", "cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-marking-400")}>
          Retake
          {fileInput}
        </label>
      </div>
    </div>
  );
}
