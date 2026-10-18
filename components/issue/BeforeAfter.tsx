"use client";

import Image from "next/image";
import { useState } from "react";
import { PHOTO_BLUR } from "@/lib/blur";

type BeforeAfterProps = {
  beforeUrl: string;
  afterUrl: string;
  /** Verdict stamp: true "Verified fixed", false "Not verified", null none. */
  passed: boolean | null;
};

/** Two photos with a draggable divider and a verdict stamp. */
export function BeforeAfter({ beforeUrl, afterUrl, passed }: BeforeAfterProps) {
  const [split, setSplit] = useState(50);
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-photo bg-asphalt-700 select-none">
      <Image placeholder="blur" blurDataURL={PHOTO_BLUR} src={beforeUrl} alt="Before" fill sizes="(min-width: 768px) 640px, 100vw" className="object-cover" />
      <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${split}%)` }}>
        <Image placeholder="blur" blurDataURL={PHOTO_BLUR} src={afterUrl} alt="After" fill sizes="(min-width: 768px) 640px, 100vw" className="object-cover" />
      </div>
      <span className="kicker absolute top-3 left-3 rounded-full bg-asphalt-900/72 px-2 py-1 backdrop-blur-[16px]">Before</span>
      <span className="kicker absolute top-3 right-3 rounded-full bg-asphalt-900/72 px-2 py-1 backdrop-blur-[16px]">After</span>
      <span aria-hidden className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-chalk-50" style={{ left: `${split}%` }}>
        <span className="absolute top-1/2 left-1/2 size-8 -translate-1/2 rounded-full border-2 border-chalk-50 bg-asphalt-900/72" />
      </span>
      {passed !== null && (
        <span
          className={`absolute right-4 bottom-4 -rotate-8 rounded-[10px] border-[3px] px-3 py-1 font-display text-lg font-bold uppercase ${
            passed ? "border-verified-500 text-verified-500" : "border-alert-500 text-alert-500"
          } bg-asphalt-950/80`}
        >
          {passed ? "Verified fixed" : "Not verified"}
        </span>
      )}
      <input
        type="range"
        min={0}
        max={100}
        value={split}
        onChange={(e) => setSplit(Number(e.target.value))}
        aria-label="Compare before and after"
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
      />
    </div>
  );
}
