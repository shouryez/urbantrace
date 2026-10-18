"use client";

// Client panels for the case page: the time machine (features 6, 7, 15, 19), the "what if we don't
// fix this" scenario (14) and citizen confirmation of a fix (18).
import { CloudRain, FlaskConical, History, ThumbsDown, ThumbsUp } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CATEGORY_LABELS, type Scenario } from "@/lib/ai/schemas";
import { getDeviceId } from "@/lib/device";
import type { PlaceHistory } from "@/lib/intel-server/place";
import { Section } from "./Panels";

const STATE: Record<string, { dot: string; label: string }> = {
  normal: { dot: "bg-mint", label: "Normal" },
  minor: { dot: "bg-amber", label: "Minor" },
  problem: { dot: "bg-ember", label: "Problem" },
  repaired: { dot: "bg-ion", label: "Repaired" },
};

export function TimeMachinePanel({ lat, lng, segmentKey }: { lat: number; lng: number; segmentKey: string | null }) {
  const [data, setData] = useState<PlaceHistory | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams({ lat: String(lat), lng: String(lng), radius: "60", ...(segmentKey ? { segment: segmentKey } : {}) });
    fetch(`/api/history?${q}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("history"))))
      .then((d: PlaceHistory) => setData(d))
      .catch(() => setFailed(true));
  }, [lat, lng, segmentKey]);

  return (
    <Section title="Civic time machine" icon={<History size={18} aria-hidden />} note={data && <span className="num text-xs text-fog-300">{data.issues.length} reports here</span>}>
      {failed && <p className="text-sm text-fog-300">The history could not load right now.</p>}
      {!data && !failed && <div className="skeleton h-24 rounded-xl" />}
      {data && (
        <>
          <div className="overflow-x-auto pb-1">
            <ol className="flex min-w-max gap-1">
              {data.months.map((m) => (
                <li key={m.month} className="flex w-16 flex-col items-center gap-1.5 text-center" title={m.events.map((e) => `${e.kind} ${CATEGORY_LABELS[e.category]} ${e.day}`).join("\n")}>
                  <span className={`size-4 rounded-full ${STATE[m.state]?.dot}`} />
                  <span className="num text-[11px]">{m.month.slice(2)}</span>
                  {m.rainMm !== null && <span className="num text-[10px] text-cyan">{m.rainMm} mm</span>}
                  <span className="text-[10px] text-fog-500">{m.events.map((e) => (e.kind === "repaired" ? "✓" : e.kind === "returned" ? "↺" : "•")).join("")}</span>
                </li>
              ))}
            </ol>
          </div>
          <p className="text-sm">{data.pattern}</p>
          {data.recurrences.length > 0 && (
            <div className="rounded-xl border border-ember/40 bg-ember/10 p-3 text-sm">
              <p className="font-extrabold text-ember uppercase">⚠ Recurring issue</p>
              <ul className="mt-2 flex flex-col gap-1">
                {data.recurrences.map((r) => (
                  <li key={r.issueId} className="num text-xs">
                    repaired {r.repairedOn} → returned {r.returnedOn} · lasted {r.lastedDays} days
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-xl bg-white/4 p-3">
              <p className="text-xs text-fog-500">Repair history{data.segment.road ? ` · ${data.segment.road}` : ""}</p>
              <p className="num mt-1">
                {Object.keys(data.repairsByYear).length
                  ? Object.entries(data.repairsByYear)
                      .map(([y, n]) => `${y} → ${n}`)
                      .join(" · ")
                  : "no verified repairs yet"}
              </p>
              {data.segment.lastRepairDaysAgo !== null && <p className="text-xs text-fog-300">last repair {data.segment.lastRepairDaysAgo} days ago</p>}
            </div>
            <div className="rounded-xl bg-white/4 p-3">
              <p className="flex items-center gap-1.5 text-xs text-fog-500">
                <CloudRain size={13} aria-hidden /> Rain and reports here
              </p>
              <p className="mt-1">{data.rain.summary}</p>
            </div>
          </div>
          <p className="text-xs text-fog-500">Repair history is documented record only; it does not judge any contractor. Weather data by Open-Meteo.com.</p>
        </>
      )}
    </Section>
  );
}

export function ScenarioPanel({ endpoint, initial }: { endpoint: string; initial: Scenario | null }) {
  const [scenario, setScenario] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(endpoint, { method: "POST" });
      const body = (await res.json()) as { scenario?: Scenario; error?: string };
      if (!res.ok || !body.scenario) throw new Error(body.error ?? "Could not build the scenario");
      setScenario(body.scenario);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build the scenario");
    } finally {
      setBusy(false);
    }
  };
  const level = (l: string) => (l === "high" ? "text-siren" : l === "medium" ? "text-amber" : "text-mint");
  return (
    <Section title="What happens if we don't fix this?" icon={<FlaskConical size={18} aria-hidden />}>
      {scenario ? (
        <>
          <ol className="flex flex-col gap-2">
            {scenario.chain.map((s, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="num flex size-6 shrink-0 items-center justify-center rounded-full bg-white/8 text-xs">{i + 1}</span>
                <span>
                  <span className="font-bold">{s.effect}</span>
                  <span className="text-fog-300"> · {s.why}</span>
                </span>
              </li>
            ))}
          </ol>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            {(
              [
                ["Road users", scenario.road_users],
                ["Accessibility", scenario.accessibility],
                ["Recurrence", scenario.recurrence],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="rounded-xl bg-white/4 py-2">
                <p className="text-fog-500">{k}</p>
                <p className={`font-extrabold uppercase ${level(v)}`}>{v}</p>
              </div>
            ))}
          </div>
          <p className="text-sm">{scenario.summary}</p>
          <p className="text-xs text-fog-500">Model-generated scenario analysis, not a prediction that this will happen.</p>
          <div>
            <Button variant="ghost" onClick={() => void run()} disabled={busy}>
              {busy ? "Thinking…" : "Rebuild scenario"}
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-fog-300">Ask the model to trace the likely chain of consequences from the facts of this case.</p>
          <Button onClick={() => void run()} disabled={busy}>
            {busy ? "Thinking…" : "Show the risk chain"}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
    </Section>
  );
}

export function CitizenConfirm({ issueId, initial }: { issueId: number; initial: { fixed: number; notFixed: number } }) {
  const [counts, setCounts] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const send = async (fixed: boolean) => {
    setMessage(null);
    const res = await fetch(`/api/issues/${issueId}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: getDeviceId(), fixed }),
    });
    const body = (await res.json()) as { yes?: number; no?: number; state?: string; error?: string };
    if (!res.ok) {
      setMessage(body.error ?? "Could not record that");
      return;
    }
    setCounts({ fixed: body.yes ?? 0, notFixed: body.no ?? 0 });
    setMessage(body.state === "confirmed" ? "Thanks. Residents have confirmed the fix." : body.state === "disputed" ? "Thanks. The issue has been reopened." : "Thanks, recorded.");
  };
  return (
    <div className="flex flex-col gap-3 rounded-card border border-mint/30 bg-mint/5 p-5">
      <p className="font-display text-lg font-semibold">You verify: is it really fixed?</p>
      <p className="text-sm text-fog-300">If you reported this issue, confirm what you see on the ground. Two confirmations close the loop; a majority saying no reopens it.</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void send(true)}>
          <ThumbsUp size={16} aria-hidden /> Yes, it is fixed
        </Button>
        <Button variant="secondary" onClick={() => void send(false)}>
          <ThumbsDown size={16} aria-hidden /> No, still a problem
        </Button>
        <span className="num text-sm text-fog-300">
          {counts.fixed} yes · {counts.notFixed} no
        </span>
      </div>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
