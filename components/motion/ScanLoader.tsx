import type { ReactNode } from "react";

type ScanLoaderProps = {
  active: boolean;
  children: ReactNode;
  className?: string;
};

/** A yellow scan line sweeping over the photo (every 1.2 s) while the model reads it. */
export function ScanLoader({ active, children, className = "" }: ScanLoaderProps) {
  return (
    <div className={`relative overflow-hidden rounded-photo ${className}`.trim()}>
      {children}
      {active && (
        <div aria-hidden className="pointer-events-none absolute inset-0 animate-scan will-change-transform">
          <div className="h-20 -translate-y-full border-b-2 border-marking-400 bg-linear-to-b from-transparent to-marking-400/25" />
        </div>
      )}
    </div>
  );
}
