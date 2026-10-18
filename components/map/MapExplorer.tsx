"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { IssueCard } from "@/components/issue/IssueCard";
import { buttonClasses } from "@/components/ui/Button";
import type { IssueCollection, IssueFeature, IssueFilters } from "@/lib/issues";
import { supabaseBrowser } from "@/lib/supabase/client";
import { BottomSheet } from "./BottomSheet";
import { Filters } from "./Filters";
import type { Bbox } from "./MapView";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-asphalt-900" />,
});

const LIST_LIMIT = 100;

type LoadState = { kind: "loading" } | { kind: "ready" } | { kind: "error" };

export function MapExplorer() {
  const reduce = useReducedMotion();
  const [filters, setFilters] = useState<IssueFilters>({});
  const [bbox, setBbox] = useState<Bbox | null>(null);
  const [issues, setIssues] = useState<IssueFeature[]>([]);
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [hoverId, setHoverId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [freshIds, setFreshIds] = useState<ReadonlySet<number>>(new Set());
  const [refresh, setRefresh] = useState(0);

  // Refetch on pan and zoom, debounced 300 ms.
  const boundsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleBounds = useCallback((next: Bbox) => {
    if (boundsTimer.current) clearTimeout(boundsTimer.current);
    boundsTimer.current = setTimeout(() => setBbox(next), 300);
  }, []);
  useEffect(() => () => {
    if (boundsTimer.current) clearTimeout(boundsTimer.current);
  }, []);

  useEffect(() => {
    if (!bbox) return;
    const ctrl = new AbortController();
    const params = new URLSearchParams({ bbox: bbox.map((n) => n.toFixed(5)).join(",") });
    if (filters.status) params.set("status", filters.status);
    if (filters.category) params.set("category", filters.category);
    if (filters.corporation) params.set("corporation", filters.corporation);
    fetch(`/api/issues?${params}`, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as IssueCollection;
        setIssues(data.features);
        setLoad({ kind: "ready" });
      })
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted) {
          console.error("Loading issues failed:", err);
          setLoad({ kind: "error" });
        }
      });
    return () => ctrl.abort();
  }, [bbox, filters, refresh]);

  // Realtime: a new or merged report drops onto every open map and its pin pulses once.
  useEffect(() => {
    const db = supabaseBrowser();
    const timers: ReturnType<typeof setTimeout>[] = [];
    const channel = db
      .channel("issues-map")
      .on("postgres_changes", { event: "*", schema: "public", table: "issues" }, (payload) => {
        const id = (payload.new as { id?: unknown }).id;
        if (typeof id === "number") {
          setFreshIds((s) => new Set(s).add(id));
          timers.push(
            setTimeout(() => {
              setFreshIds((s) => {
                const next = new Set(s);
                next.delete(id);
                return next;
              });
            }, 1200),
          );
        }
        setRefresh((n) => n + 1);
      })
      .subscribe();
    return () => {
      timers.forEach(clearTimeout);
      void db.removeChannel(channel);
    };
  }, []);

  const selected = issues.find((f) => f.properties.id === selectedId) ?? null;
  const activeId = hoverId ?? selectedId;
  const listed = issues.slice(0, LIST_LIMIT);

  const countLabel = (
    <span className="text-sm text-mist-300">
      {load.kind === "loading" && "Loading issues…"}
      {load.kind === "error" && "Could not load issues. Pan the map to retry."}
      {load.kind === "ready" && (
        <>
          <span className="font-mono text-chalk-50">{issues.length}</span> {issues.length === 1 ? "issue" : "issues"} in view
        </>
      )}
    </span>
  );

  const list = (
    <ul className="flex flex-col gap-3 pt-1">
      {listed.map((f) => {
        const id = f.properties.id;
        return (
          <li key={id}>
            <button
              type="button"
              className="block w-full rounded-card text-left"
              onMouseEnter={() => setHoverId(id)}
              onMouseLeave={() => setHoverId(null)}
              onFocus={() => setHoverId(id)}
              onBlur={() => setHoverId(null)}
              onClick={() => setSelectedId(id)}
            >
              <IssueCard issue={f.properties} active={id === activeId} />
            </button>
          </li>
        );
      })}
      {load.kind === "ready" && issues.length === 0 && (
        <li className="py-6 text-center text-sm text-mist-300">No issues here yet. Pan the map, or report one.</li>
      )}
    </ul>
  );

  const previewMotion = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.15 } }
    : {
        initial: { opacity: 0, y: 24 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: 24 },
        transition: { type: "spring" as const, stiffness: 400, damping: 22 },
      };

  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-0 z-0">
        <MapView
          issues={issues}
          activeId={activeId}
          selectedId={selectedId}
          freshIds={freshIds}
          onBoundsChange={handleBounds}
          onHover={setHoverId}
          onSelect={setSelectedId}
        />
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-[600] p-3 md:left-[25rem]">
        <div className="pointer-events-auto">
          <Filters value={filters} onChange={setFilters} />
        </div>
      </div>

      {/* Desktop: list beside the map, linked to the pins both ways */}
      <aside className="absolute top-3 bottom-3 left-3 z-[600] hidden w-96 flex-col gap-3 rounded-card border border-white/6 bg-asphalt-900/72 p-3 backdrop-blur-[16px] md:flex">
        <div className="px-1">{countLabel}</div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">{list}</div>
      </aside>

      {/* Phones: list in a bottom sheet */}
      <div className="md:hidden">
        <BottomSheet title={countLabel}>{list}</BottomSheet>
      </div>

      <AnimatePresence>
        {selected && (
          <motion.div
            key={selected.properties.id}
            {...previewMotion}
            className="absolute inset-x-3 bottom-[calc(15vh+12px)] z-[700] mx-auto max-w-sm md:right-6 md:bottom-6 md:left-auto md:mx-0 md:w-96"
          >
            <div className="relative rounded-card border border-white/6 bg-asphalt-900/72 p-2 backdrop-blur-[16px]">
              <IssueCard issue={selected.properties} />
              <div className="flex items-center gap-3 p-2">
                <Link href={`/issue/${selected.properties.id}`} className={buttonClasses("primary")}>
                  Open issue
                </Link>
                <span className="text-sm text-mist-300">{selected.properties.address}</span>
              </div>
              <button
                type="button"
                aria-label="Close preview"
                className="absolute top-4 right-4 rounded-full bg-asphalt-900/72 p-1.5 text-chalk-50"
                onClick={() => setSelectedId(null)}
              >
                <X size={18} strokeWidth={1.75} aria-hidden />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
