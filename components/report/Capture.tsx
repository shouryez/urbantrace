"use client";

import { Camera } from "lucide-react";
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
      <div className="flex flex-col items-center gap-6 py-10 text-center">
        <h2 className="font-display text-[32px] leading-tight font-semibold">Snap the problem</h2>
        <p className="max-w-sm text-mist-300">A pothole, a garbage pile, a dead streetlight. One clear photo is enough.</p>
        <label
          className="flex size-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-full bg-marking-400 text-asphalt-950 transition-transform duration-150 ease-out focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-marking-400 active:scale-[0.97]"
        >
          <Camera size={40} strokeWidth={1.75} aria-hidden />
          <span className="text-sm font-medium">Take photo</span>
          {fileInput}
        </label>
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
