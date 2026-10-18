"use client";

// The ward directory: all 369 wards, searchable by name, number, zone or constituency, filtered by
// corporation, with each ward's open issues.
import Link from "next/link";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { WardSummary } from "@/lib/wards";

const CORPS = [
  ["all", "All"],
  ["central", "Central"],
  ["east", "East"],
  ["north", "North"],
  ["south", "South"],
  ["west", "West"],
] as const;

export function WardDirectory({ wards }: { wards: WardSummary[] }) {
  const [q, setQ] = useState("");
  const [corp, setCorp] = useState<string>("all");
  const [sort, setSort] = useState<"number" | "open">("open");
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return wards
      .filter((w) => corp === "all" || w.corporationId === corp)
      .filter(
        (w) =>
          !needle ||
          w.name.toLowerCase().includes(needle) ||
          String(w.number) === needle ||
          (w.zoneName ?? "").toLowerCase().includes(needle) ||
          (w.assembly ?? "").toLowerCase().includes(needle) ||
          (w.nameKn ?? "").includes(q.trim()),
      )
      .sort((a, b) => (sort === "open" ? b.open - a.open || (a.number ?? 0) - (b.number ?? 0) : a.corporationId.localeCompare(b.corporationId) || (a.number ?? 0) - (b.number ?? 0)));
  }, [wards, q, corp, sort]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <label className="flex flex-1 items-center gap-2 rounded-full border border-white/10 bg-ink-800/70 px-4 py-2.5">
          <Search size={16} className="text-fog-300" aria-hidden />
          <span className="sr-only">Search wards</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a ward, number, zone or constituency" className="w-full bg-transparent text-sm outline-none" />
        </label>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Corporation">
          {CORPS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={corp === id}
              onClick={() => setCorp(id)}
              className={`rounded-full px-3.5 py-2 text-sm font-bold ${corp === id ? "bg-white/12 text-fog-50" : "text-fog-300 hover:text-fog-50"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as "number" | "open")} className="rounded-full border border-white/10 bg-ink-800 px-3 py-2 text-sm" aria-label="Sort">
          <option value="open">Most open issues</option>
          <option value="number">Ward number</option>
        </select>
      </div>
      <p className="num text-xs text-fog-300">
        {shown.length} of {wards.length} wards
      </p>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((w) => (
          <li key={w.id}>
            <Link href={`/ward/${w.id}`} className="flex h-full flex-col gap-2 rounded-card panel p-4 transition-transform hover:-translate-y-0.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-display text-lg font-semibold">{w.name}</p>
                  {w.nameKn && <p className="truncate text-xs text-fog-300">{w.nameKn}</p>}
                </div>
                <span className="num shrink-0 rounded-lg bg-white/6 px-2 py-1 text-xs">#{w.number}</span>
              </div>
              <p className="text-xs text-fog-300">
                {w.corporation.replace(" City Corporation", "")} · {w.zoneName ? `${w.zoneName} zone` : "zone –"} · {w.assembly ?? "–"}
              </p>
              <div className="num mt-auto flex gap-4 pt-2 text-xs">
                <span className={w.open ? "text-ember" : "text-fog-300"}>{w.open} open</span>
                <span className={w.verified ? "text-mint" : "text-fog-300"}>{w.verified} fixed</span>
                {w.population !== null && <span className="text-fog-300">{w.population.toLocaleString("en-IN")} people</span>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
