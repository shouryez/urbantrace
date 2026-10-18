"use client";

import { animate, motion, useDragControls, useMotionValue, useReducedMotion, type PanInfo } from "motion/react";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

/** Snap heights as a share of the screen. */
const SNAPS = [0.15, 0.5, 0.9] as const;
const snapAt = (i: number): number => SNAPS[i] ?? SNAPS[0];

function subscribe(cb: () => void) {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
}
const getHeight = () => window.innerHeight;
const getServerHeight = () => 0;

type BottomSheetProps = {
  title: ReactNode;
  children: ReactNode;
};

/** Glass panel that drags up over the map on phones, snapping at 15, 50 and 90 percent. */
export function BottomSheet({ title, children }: BottomSheetProps) {
  const reduce = useReducedMotion();
  const vh = useSyncExternalStore(subscribe, getHeight, getServerHeight);
  const [snap, setSnap] = useState(0);
  const controls = useDragControls();
  const dragged = useRef(false); // a drag also ends in a click on the handle; ignore that one
  const sheetHeight = vh * SNAPS[2];
  const yFor = (i: number) => sheetHeight - vh * snapAt(i);
  const y = useMotionValue(vh ? yFor(0) : 2000);

  useEffect(() => {
    if (!vh) return;
    const target = sheetHeight - vh * snapAt(snap);
    const anim = animate(y, target, reduce ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 22 });
    return () => anim.stop();
  }, [snap, vh, sheetHeight, reduce, y]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    dragged.current = true;
    const projected = y.get() + info.velocity.y * 0.2;
    let best = 0;
    SNAPS.forEach((_, i) => {
      if (Math.abs(yFor(i) - projected) < Math.abs(yFor(best) - projected)) best = i;
    });
    if (best === snap) {
      // Same snap point: spring back to it.
      void animate(y, yFor(best), reduce ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 22 });
    }
    setSnap(best);
  };

  const visible = vh * snapAt(snap);

  return (
    <motion.section
      aria-label="Issues list"
      className="fixed inset-x-0 bottom-0 z-[500] flex flex-col rounded-t-card border-t border-white/6 bg-asphalt-900/72 backdrop-blur-[16px] will-change-transform"
      style={{ height: sheetHeight || "90vh", y }}
      drag="y"
      dragControls={controls}
      dragListener={false}
      dragConstraints={{ top: 0, bottom: yFor(0) }}
      dragElastic={0.05}
      onDragEnd={onDragEnd}
    >
      <button
        type="button"
        className="flex shrink-0 cursor-grab touch-none flex-col items-center gap-2 px-4 pt-2 pb-3"
        onPointerDown={(e) => {
          dragged.current = false;
          controls.start(e);
        }}
        onClick={() => {
          if (dragged.current) {
            dragged.current = false;
            return;
          }
          setSnap((s) => (s + 1) % SNAPS.length);
        }}
        aria-label="Resize list"
      >
        <span className="h-1 w-10 rounded-full bg-mist-300/60" aria-hidden />
        <span className="w-full text-left">{title}</span>
      </button>
      <div className="min-h-0 overflow-y-auto overscroll-contain px-4 pb-4" style={{ height: Math.max(0, visible - 64) }}>
        {children}
      </div>
    </motion.section>
  );
}
