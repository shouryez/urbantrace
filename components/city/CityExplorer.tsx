"use client";

// The live city map: 3D layers, what's wrong around me (13), incidents and live alerts (2, 3, 16),
// the accessible route planner (10) and the civic time machine slider (6).
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type * as maplibregl from "maplibre-gl";
import { Accessibility, Clock, Crosshair, Layers, Loader2, MapPin, Navigation, Plus, Route as RouteIcon, Siren, X } from "lucide-react";
import type { CityIncident, CityIssue, CityLayers } from "@/components/city/CityMap";
import { geohash } from "@/lib/intel/geo";
import type { RankedRoute } from "@/lib/intel/route";
import type { ZoneReport } from "@/lib/intel-server/place";
import { supabaseBrowser } from "@/lib/supabase/client";

const CityMap = dynamic(() => import("@/components/city/CityMap"), { ssr: false });

type Place = { name: string; lat: number; lng: number };
type Panel = { kind: "zone"; cell: string } | { kind: "issue"; id: number } | { kind: "incident"; id: number } | { kind: "route" } | null;

const LAYER_LABELS: [keyof CityLayers, string][] = [
  ["issues", "Issues"],
  ["priority", "Priority columns"],
  ["health", "Civic health"],
  ["incidents", "Incidents"],
  ["accessibility", "Accessibility"],
];

const glass = "rounded-card border border-white/10 bg-ink-900/80 shadow-2xl backdrop-blur-xl";

export function CityExplorer({ issues, incidents: initialIncidents }: { issues: CityIssue[]; incidents: CityIncident[] }) {
  const router = useRouter();
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [layers, setLayers] = useState<CityLayers>({ issues: true, incidents: true, priority: false, health: false, accessibility: false });
  const [showLayers, setShowLayers] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [incidents, setIncidents] = useState(initialIncidents);
  const [newAlert, setNewAlert] = useState<CityIncident | null>(null);
  const [routes, setRoutes] = useState<RankedRoute[]>([]);

  // Time machine: slider from the first report to now.
  const [start, end] = useMemo(() => {
    const times = issues.map((i) => new Date(i.createdAt).getTime());
    const last = times.length ? Math.max(...times) : 0;
    return [times.length ? Math.min(...times) : 0, last];
  }, [issues]);
  const [until, setUntil] = useState<number | null>(null);

  // Live: new issues refresh the server data; incident changes refetch incidents and raise new alerts.
  useEffect(() => {
    const db = supabaseBrowser();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const known = new Set(initialIncidents.map((i) => i.id));
    const channel = db
      .channel("city-map")
      .on("postgres_changes", { event: "*", schema: "public", table: "issues" }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => router.refresh(), 1500);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "incidents" }, async () => {
        const res = await fetch("/api/incidents");
        if (!res.ok) return;
        const list = ((await res.json()) as { incidents: (CityIncident & { status: string })[] }).incidents.map((i) => ({
          id: i.id,
          lng: i.lng,
          lat: i.lat,
          radiusM: i.radiusM,
          kind: i.kind,
          reportCount: i.reportCount,
          title: i.title,
        }));
        setIncidents(list);
        const fresh = list.find((i) => i.kind === "alert" && !known.has(i.id));
        list.forEach((i) => known.add(i.id));
        if (fresh) setNewAlert(fresh);
      })
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void db.removeChannel(channel);
    };
  }, [initialIncidents, router]);

  const fly = (lat: number, lng: number, zoom = 15) => mapRef.current?.flyTo({ center: [lng, lat], zoom, pitch: 55, duration: 1400, essential: true });
  const openZone = (p: { lat: number; lng: number }) => setPanel({ kind: "zone", cell: geohash(p, 6) });

  const aroundMe = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        fly(p.lat, p.lng);
        openZone(p);
      },
      () => setPanel({ kind: "zone", cell: geohash({ lat: 12.9716, lng: 77.5946 }, 6) }),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const alerts = incidents.filter((i) => i.kind === "alert");
  const routeLines = routes.map((r) => ({ coordinates: r.coordinates, recommended: r.recommended }));

  return (
    <div className="relative h-full w-full bg-ink-950">
      <CityMap
        className="absolute inset-0"
        issues={issues}
        incidents={incidents}
        route={routeLines}
        layers={layers}
        until={until}
        selectedIssueId={panel?.kind === "issue" ? panel.id : null}
        onReady={(m) => (mapRef.current = m)}
        onIssueClick={(id) => setPanel({ kind: "issue", id })}
        onIncidentClick={(id) => setPanel({ kind: "incident", id })}
        onHexClick={openZone}
        onMapClick={(p) => panel?.kind !== "route" && openZone(p)}
      />

      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-[76px] flex flex-col gap-2 p-3 md:top-20 md:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="pointer-events-auto flex items-center gap-2">
            <div className={`${glass} hidden px-4 py-2 sm:block`}>
              <p className="font-display text-sm font-semibold">Bengaluru, live</p>
              <p className="num text-xs text-fog-300">
                {issues.filter((i) => i.status !== "verified").length} open · {incidents.filter((i) => i.kind === "cluster").length} incidents · {alerts.length} alerts
              </p>
            </div>
          </div>
          <div className="pointer-events-auto flex flex-wrap justify-end gap-2">
            <button type="button" onClick={aroundMe} className={`${glass} flex items-center gap-2 !rounded-full px-4 py-2.5 text-sm font-bold`}>
              <Crosshair size={16} aria-hidden /> What&apos;s wrong around me
            </button>
            <button type="button" onClick={() => setPanel({ kind: "route" })} className={`${glass} flex items-center gap-2 !rounded-full px-4 py-2.5 text-sm font-bold`}>
              <Accessibility size={16} aria-hidden /> <span className="hidden sm:inline">Accessible route</span>
            </button>
            <button type="button" aria-expanded={showLayers} onClick={() => setShowLayers((v) => !v)} className={`${glass} flex size-11 items-center justify-center !rounded-full`} aria-label="Map layers">
              <Layers size={18} aria-hidden />
            </button>
          </div>
        </div>

        {showLayers && (
          <div className={`${glass} pointer-events-auto ml-auto flex w-60 flex-col gap-1 p-3`}>
            {LAYER_LABELS.map(([key, label]) => (
              <label key={key} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-white/5">
                {label}
                <input type="checkbox" checked={!!layers[key]} onChange={(e) => setLayers((l) => ({ ...l, [key]: e.target.checked }))} className="accent-[var(--color-signal)]" />
              </label>
            ))}
          </div>
        )}

        {(newAlert ?? alerts[0]) && (
          <AlertBanner alert={(newAlert ?? alerts[0])!} live={!!newAlert} onShow={(a) => (fly(a.lat, a.lng, 14), setPanel({ kind: "incident", id: a.id }))} onClose={() => setNewAlert(null)} />
        )}
      </div>

      {/* Bottom: time machine and side panel */}
      <div className="pointer-events-none absolute inset-x-0 bottom-24 flex flex-col gap-2 p-3 md:bottom-0 md:flex-row md:items-end md:justify-between md:p-4">
        {start < end && (
          <div className={`${glass} pointer-events-auto flex w-full flex-col gap-1 px-4 py-3 md:max-w-md`}>
            <label htmlFor="time-machine" className="flex items-center justify-between text-xs font-bold">
              <span className="flex items-center gap-1.5">
                <Clock size={13} aria-hidden /> Civic time machine
              </span>
              <span className="num font-normal text-fog-300">{until === null ? "now" : new Date(until).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
            </label>
            <input
              id="time-machine"
              type="range"
              min={start}
              max={end}
              step={Math.max(1, Math.round((end - start) / 200))}
              value={until ?? end}
              onChange={(e) => {
                const v = Number(e.target.value);
                setUntil(v >= end ? null : v);
              }}
              className="w-full accent-[var(--color-signal)]"
            />
          </div>
        )}
        <Link href="/report" className="pointer-events-auto hidden items-center justify-center gap-2 self-end rounded-full bg-signal px-5 py-3 font-bold text-ink-950 shadow-2xl md:flex">
          <Plus size={18} aria-hidden /> Report
        </Link>
      </div>

      {panel && (
        <aside className={`${glass} absolute inset-x-3 bottom-24 z-10 max-h-[55svh] overflow-y-auto p-5 md:inset-x-auto md:top-40 md:right-4 md:bottom-auto md:w-96`}>
          <button type="button" aria-label="Close" onClick={() => (setPanel(null), setRoutes([]))} className="absolute top-3 right-3 rounded-full p-1.5 text-fog-300 hover:bg-white/8">
            <X size={16} aria-hidden />
          </button>
          {panel.kind === "zone" && <ZonePanel key={panel.cell} cell={panel.cell} />}
          {panel.kind === "issue" && <IssuePanel id={panel.id} issue={issues.find((i) => i.id === panel.id)} />}
          {panel.kind === "incident" && <IncidentPanel incident={incidents.find((i) => i.id === panel.id)} />}
          {panel.kind === "route" && <RoutePanel routes={routes} onRoutes={(r) => setRoutes(r)} onFly={fly} />}
        </aside>
      )}
    </div>
  );
}

function AlertBanner({ alert, live, onShow, onClose }: { alert: CityIncident; live: boolean; onShow: (a: CityIncident) => void; onClose: () => void }) {
  return (
    <div role={live ? "alert" : "status"} className="pointer-events-auto mx-auto flex w-full max-w-xl items-center gap-3 rounded-card border border-siren/50 bg-siren/15 px-4 py-3 backdrop-blur-xl">
      <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-siren text-ink-950">
        <Siren size={17} aria-hidden />
        <span className="pulse-ring absolute inset-0 rounded-full border-2 border-siren" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-extrabold tracking-wide text-siren uppercase">{live ? "New civic alert" : "Civic alert"}</p>
        <p className="truncate text-sm font-semibold">
          {alert.title} · <span className="num">{alert.reportCount}</span> reports
        </p>
      </div>
      <button type="button" onClick={() => onShow(alert)} className="rounded-full bg-siren px-3 py-1.5 text-xs font-bold text-ink-950">
        Show
      </button>
      {live && (
        <button type="button" aria-label="Dismiss" onClick={onClose} className="text-fog-300">
          <X size={16} aria-hidden />
        </button>
      )}
    </div>
  );
}

function ZonePanel({ cell }: { cell: string }) {
  const [zone, setZone] = useState<ZoneReport | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch(`/api/zones/${cell}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("zone"))))
      .then((z: ZoneReport) => setZone(z))
      .catch(() => setFailed(true));
  }, [cell]);
  if (failed) return <p className="text-sm text-fog-300">This area could not load right now.</p>;
  if (!zone) return <Loading label="Reading this area" />;
  const tone = zone.health >= 70 ? "text-mint" : zone.health >= 45 ? "text-amber" : "text-ember";
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="kicker text-fog-300">What&apos;s wrong around here</p>
        <p className="num mt-1 text-xs text-fog-500">about 1 km² · zone {cell}</p>
      </div>
      <div className="flex items-end gap-3">
        <p className={`num text-5xl font-semibold ${tone}`}>{zone.health}</p>
        <p className="pb-1.5 text-sm text-fog-300">civic health out of 100</p>
      </div>
      {zone.ward && (
        <Link href={`/ward/${zone.ward.id}`} className="self-start rounded-full border border-white/12 px-3 py-1.5 text-xs font-bold hover:bg-white/6">
          {zone.ward.name} ward: officers, MLA, funds →
        </Link>
      )}
      <p className="text-fog-100">{zone.summary}</p>
      <dl className="num grid grid-cols-3 gap-2 text-center">
        {[
          [zone.unresolved, "unresolved", ""],
          [zone.recurring, "recurring", "text-ember"],
          [zone.accessibility, "accessibility", "text-cyan"],
          [zone.reports, "reports", ""],
          [zone.incidents, "incidents", "text-violet"],
          [zone.mainIssue ?? "–", "main issue", ""],
        ].map(([v, l, t]) => (
          <div key={l} className="rounded-xl bg-white/5 px-1 py-2">
            <dd className={`truncate text-lg font-semibold ${t}`}>{v}</dd>
            <dt className="font-sans text-[11px] text-fog-300">{l}</dt>
          </div>
        ))}
      </dl>
      {zone.rain.correlation !== null && (
        <p className="text-xs text-fog-300">
          Rain link: reports here {zone.rain.ratio !== null && zone.rain.ratio > 1 ? `rise about ${zone.rain.ratio.toFixed(1)}× after heavy rain` : "do not clearly rise after rain"} (r = <span className="num">{zone.rain.correlation.toFixed(2)}</span>).
        </p>
      )}
    </div>
  );
}

function IssuePanel({ id, issue }: { id: number; issue?: CityIssue }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="kicker text-fog-300">Issue #{id}</p>
      {issue && (
        <p className="text-sm text-fog-200">
          Priority <span className="num font-semibold">{issue.priority ?? "–"}</span> · <span className="num">{issue.backerCount}</span> reports · {issue.status.replace("_", " ")}
          {issue.accessibility !== "none" && <span className="text-cyan"> · accessibility {issue.accessibility}</span>}
        </p>
      )}
      <Link href={`/issue/${id}`} className="self-start rounded-full bg-signal px-4 py-2 text-sm font-bold text-ink-950">
        Open the case
      </Link>
    </div>
  );
}

function IncidentPanel({ incident }: { incident?: CityIncident }) {
  if (!incident) return <p className="text-sm text-fog-300">This incident has been resolved.</p>;
  const alert = incident.kind === "alert";
  return (
    <div className="flex flex-col gap-3">
      <p className={`kicker ${alert ? "text-siren" : "text-violet"}`}>
        {alert ? "Civic alert" : "Possible civic incident"} · INC-{incident.id}
      </p>
      <p className="font-display text-xl font-semibold">{incident.title}</p>
      <p className="num text-sm text-fog-300">
        {incident.reportCount} reports within {Math.round(incident.radiusM)} m
      </p>
      <Link href={`/incident/${incident.id}`} className="self-start rounded-full bg-signal px-4 py-2 text-sm font-bold text-ink-950">
        See the root cause
      </Link>
    </div>
  );
}

function PlaceInput({ label, value, onPick, allowHere }: { label: string; value: Place | null; onPick: (p: Place) => void; allowHere?: boolean }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  useEffect(() => {
    if (q.trim().length < 3) return;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/places?q=${encodeURIComponent(q)}`);
      if (res.ok) setResults(((await res.json()) as { places: Place[] }).places);
    }, 450);
    return () => clearTimeout(t);
  }, [q]);
  const here = () =>
    navigator.geolocation?.getCurrentPosition((pos) => {
      onPick({ name: "My location", lat: pos.coords.latitude, lng: pos.coords.longitude });
      setQ("");
      setResults([]);
    });
  return (
    <div className="relative flex flex-col gap-1">
      <span className="text-xs font-bold text-fog-300">{label}</span>
      <div className="flex gap-2">
        <input
          value={value && !q ? value.name : q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a place in Bengaluru"
          className="min-w-0 flex-1 rounded-[14px] border border-white/8 bg-ink-700 px-3 py-2.5 text-sm"
        />
        {allowHere && (
          <button type="button" onClick={here} aria-label="Use my location" className="rounded-[14px] border border-white/8 bg-ink-700 px-3">
            <Navigation size={15} aria-hidden />
          </button>
        )}
      </div>
      {q.trim().length >= 3 && results.length > 0 && (
        <ul className="absolute top-full z-20 mt-1 w-full overflow-hidden rounded-xl border border-white/10 bg-ink-800 shadow-2xl">
          {results.slice(0, 5).map((r) => (
            <li key={`${r.lat},${r.lng}`}>
              <button
                type="button"
                onClick={() => {
                  onPick(r);
                  setQ("");
                  setResults([]);
                }}
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-white/6"
              >
                <MapPin size={14} className="mt-0.5 shrink-0 text-fog-300" aria-hidden /> <span className="line-clamp-2">{r.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RoutePanel({ routes, onRoutes, onFly }: { routes: RankedRoute[]; onRoutes: (r: RankedRoute[]) => void; onFly: (lat: number, lng: number, zoom?: number) => void }) {
  const [from, setFrom] = useState<Place | null>(null);
  const [to, setTo] = useState<Place | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plan = async () => {
    if (!from || !to) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/route?from=${from.lat},${from.lng}&to=${to.lat},${to.lng}`);
    const body = (await res.json()) as { routes?: RankedRoute[]; error?: string };
    setBusy(false);
    if (!res.ok || !body.routes) {
      setError(body.error ?? "No route found");
      return;
    }
    onRoutes(body.routes);
    onFly((from.lat + to.lat) / 2, (from.lng + to.lng) / 2, 14);
  };
  return (
    <div className="flex flex-col gap-3">
      <p className="kicker flex items-center gap-1.5 text-cyan">
        <Accessibility size={14} aria-hidden /> Accessible walking route
      </p>
      <p className="text-xs text-fog-300">Walking routes ranked by unresolved footpath, drainage and hazard reports along the way.</p>
      <PlaceInput label="From" value={from} onPick={setFrom} allowHere />
      <PlaceInput label="To" value={to} onPick={setTo} />
      <button type="button" disabled={!from || !to || busy} onClick={() => void plan()} className="flex items-center justify-center gap-2 rounded-full bg-signal px-4 py-2.5 text-sm font-bold text-ink-950 disabled:opacity-40">
        {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <RouteIcon size={15} aria-hidden />} Find routes
      </button>
      {error && (
        <p role="alert" className="text-sm text-ember">
          {error}
        </p>
      )}
      {routes.map((r, i) => (
        <div key={i} className={`flex flex-col gap-1 rounded-xl border p-3 ${r.recommended ? "border-mint/40 bg-mint/8" : "border-white/8 bg-white/4"}`}>
          <p className="flex items-center justify-between text-sm font-semibold">
            <span>{r.recommended ? "Recommended" : `Option ${i + 1}`}</span>
            <span className="num text-xs font-normal text-fog-300">
              {(r.distanceM / 1000).toFixed(1)} km · {Math.round(r.durationS / 60)} min
            </span>
          </p>
          <p className="text-xs text-fog-300">
            {r.obstacles.length ? `${r.obstacles.length} obstacle${r.obstacles.length === 1 ? "" : "s"}: ${[...new Set(r.obstacles.map((o) => o.label))].join(", ")}` : "No reported obstacles along this route"}
          </p>
        </div>
      ))}
      {routes.length > 0 && <p className="text-[11px] text-fog-500">Routes: FOSSGIS OSRM, © OpenStreetMap contributors</p>}
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-fog-300">
      <Loader2 size={15} className="animate-spin" aria-hidden /> {label}
    </p>
  );
}
