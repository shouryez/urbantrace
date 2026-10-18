import type { ReactNode } from "react";

/** Rounded asphalt-900 frame for app screens shown on the landing page. */
export function PhoneFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative aspect-[9/19] w-[min(280px,70vw)] rounded-[44px] border border-white/6 bg-asphalt-900 p-3 ${className}`}>
      <div className="relative h-full w-full overflow-hidden rounded-[34px] bg-asphalt-950">
        <span aria-hidden className="absolute top-2 left-1/2 z-20 h-5 w-20 -translate-x-1/2 rounded-full bg-asphalt-900" />
        {children}
      </div>
    </div>
  );
}
