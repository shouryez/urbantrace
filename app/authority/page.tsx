import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { History, Network, Siren } from "lucide-react";
import { AuthorityLogin, RefreshButton, SignOut, StageButton } from "@/components/authority/Controls";
import { CATEGORY_LABELS, type Category } from "@/lib/ai/schemas";
import { isAuthority } from "@/lib/authority";
import { supabaseAdmin } from "@/lib/supabase/server";
import { listIncidents } from "@/lib/incidents-query";
import { PageHeader } from "@/components/ui/PageHeader";
import { CITY_BBOX, fetchIssues } from "@/lib/issues-query";

export const metadata: Metadata = { title: "Authority console · UrbanTrace" };

const BAND = (p: number) => (p >= 70 ? "bg-siren" : p >= 50 ? "bg-ember" : p >= 30 ? "bg-amber" : "bg-ink-600 text-fog-50");

function daysSince(iso: string) {
  return Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

async function Console() {
  await connection();
  if (!(await isAuthority())) return <AuthorityLogin />;

  const [issues, incidents, { data: assignRows }] = await Promise.all([
    fetchIssues(CITY_BBOX, {}, 2000),
    listIncidents(),
    supabaseAdmin().from("issues").select("id, assignment, priority_factors").neq("status", "verified").limit(2000),
  ]);
  const extra = new Map((assignRows ?? []).map((r) => [r.id as number, r as { assignment: { department?: string; workType?: string; urgency?: string } | null; priority_factors: { reason?: string } | null }]));
  const queue = issues
    .filter((f) => f.properties.status !== "verified")
    .sort((a, b) => (b.properties.priority ?? 0) - (a.properties.priority ?? 0))
    .slice(0, 40);

  // Feature 19: repair history per road segment. Documented history only; no fault is attributed.
  const segments = new Map<string, { road: string; repairs: Record<string, number>; recurring: number; open: number; categories: Set<Category>; last: string | null }>();
  for (const f of issues) {
    const key = f.properties.segmentKey;
    if (!key) continue;
    const s = segments.get(key) ?? { road: key.split(":")[0]!.replace(/-/g, " "), repairs: {}, recurring: 0, open: 0, categories: new Set<Category>(), last: null };
    s.categories.add(f.properties.category);
    if (f.properties.recurrenceOf !== null) s.recurring++;
    if (f.properties.status !== "verified") s.open++;
    const v = f.properties.verifiedAt;
    if (v) {
      s.repairs[v.slice(0, 4)] = (s.repairs[v.slice(0, 4)] ?? 0) + 1;
      if (!s.last || v > s.last) s.last = v;
    }
    segments.set(key, s);
  }
  const segRows = [...segments.entries()]
    .sort((a, b) => b[1].recurring - a[1].recurring || Object.values(b[1].repairs).reduce((x, y) => x + y, 0) - Object.values(a[1].repairs).reduce((x, y) => x + y, 0) || b[1].open - a[1].open)
    .slice(0, 15);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <RefreshButton />
        <SignOut />
      </div>

      {incidents.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl font-semibold">Active incidents and alerts</h2>
          <ul className="grid gap-3 md:grid-cols-3">
            {incidents.slice(0, 6).map((i) => (
              <li key={i.id}>
                <Link href={`/incident/${i.id}`} className={`flex flex-col gap-1 rounded-card border p-4 ${i.kind === "alert" ? "border-siren/40 bg-siren/8" : "border-violet/30 bg-violet/6"}`}>
                  <span className={`flex items-center gap-1.5 text-xs font-extrabold uppercase ${i.kind === "alert" ? "text-siren" : "text-violet"}`}>
                    {i.kind === "alert" ? <Siren size={13} aria-hidden /> : <Network size={13} aria-hidden />} {i.kind}
                  </span>
                  <span className="font-semibold">{i.title}</span>
                  <span className="num text-xs text-fog-300">
                    {i.reportCount} reports · {Math.round(i.confidence * 100)}%
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-semibold">Priority queue</h2>
        <p className="text-sm text-fog-300">Open cases ranked by the explainable priority signal, not by upvotes.</p>
        <ul className="flex flex-col divide-y divide-white/6 rounded-card panel">
          {queue.map((f) => {
            const p = f.properties;
            const x = extra.get(p.id);
            return (
              <li key={p.id} className="grid gap-3 p-4 md:grid-cols-[64px_1fr_auto] md:items-center">
                <span className={`num flex size-12 items-center justify-center rounded-2xl text-lg font-semibold text-ink-950 ${BAND(p.priority ?? 0)}`}>{p.priority ?? "–"}</span>
                <div className="flex min-w-0 flex-col gap-1">
                  <Link href={`/issue/${p.id}`} className="font-semibold underline-offset-4 hover:underline">
                    {CATEGORY_LABELS[p.category]} · <span className="font-normal text-fog-200">{p.summary}</span>
                  </Link>
                  <p className="text-xs text-fog-300">
                    #{p.id} · {p.address ?? "no address"} · {p.backerCount} reports · stage {p.stage.replace("_", " ")}
                    {p.recurrenceOf !== null && <span className="text-ember"> · recurring</span>}
                    {p.accessibility !== "none" && <span className="text-cyan"> · accessibility {p.accessibility}</span>}
                    {p.incidentId !== null && <span className="text-violet"> · incident</span>}
                  </p>
                  {x?.assignment && (
                    <p className="text-xs text-fog-500">
                      {x.assignment.department} · {x.assignment.workType} · {x.assignment.urgency}
                      {x.priority_factors?.reason ? ` · ${x.priority_factors.reason}` : ""}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 md:justify-end">
                  <StageButton issueId={p.id} stage={p.stage} />
                  <Link href={`/issue/${p.id}/verify`} className="rounded-full px-3 py-1.5 text-xs font-bold text-signal underline-offset-4 hover:underline">
                    Upload fix
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
          <History size={18} aria-hidden /> Road segment repair history
        </h2>
        <p className="text-sm text-fog-300">
          Documented repairs and recurring problems per road segment (about 150 m). An analytical signal for where a lasting fix is needed; it does not attribute fault to any contractor.
        </p>
        <div className="overflow-x-auto rounded-card panel">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-fog-500">
              <tr>
                <th className="p-3">Segment</th>
                <th className="p-3">Repairs by year</th>
                <th className="p-3">Recurring</th>
                <th className="p-3">Open</th>
                <th className="p-3">Problems</th>
                <th className="p-3">Last repair</th>
              </tr>
            </thead>
            <tbody>
              {segRows.map(([key, s]) => (
                <tr key={key} className="border-t border-white/6">
                  <td className="p-3 capitalize">
                    {s.road} <span className="num text-xs text-fog-500">{key.split(":")[1]}</span>
                  </td>
                  <td className="num p-3">{Object.keys(s.repairs).length ? Object.entries(s.repairs).map(([y, n]) => `${y} → ${n}`).join(" · ") : "–"}</td>
                  <td className={`num p-3 ${s.recurring ? "text-ember" : ""}`}>{s.recurring}</td>
                  <td className="num p-3">{s.open}</td>
                  <td className="p-3 text-xs text-fog-300">{[...s.categories].map((c) => CATEGORY_LABELS[c]).join(", ")}</td>
                  <td className="num p-3 text-xs">{s.last ? `${daysSince(s.last)} days ago` : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default function AuthorityPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8 md:px-6">
      <PageHeader kicker="Authority console" title="Work the queue, fix the" accent="root">
        Cases ranked by an explainable priority, moved stage by stage, with the repair history of every road segment.
      </PageHeader>
      <Suspense fallback={<div className="skeleton h-64 rounded-card" />}>
        <Console />
      </Suspense>
    </main>
  );
}
