"use client";

// The 3D city: MapLibre with OpenFreeMap's dark vector tiles and extruded OpenStreetMap buildings,
// plus deck.gl layers for civic data — issues by status, priority columns, civic health hexagons,
// incident rings, evidence arcs and accessible routes. The camera can be driven from outside
// (the landing page flies it with scroll). Client only: loaded with next/dynamic.
import "maplibre-gl/dist/maplibre-gl.css";
import * as maplibregl from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { HexagonLayer } from "@deck.gl/aggregation-layers";
import { ArcLayer, ColumnLayer, PathLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import type { Color, Layer, PickingInfo } from "@deck.gl/core";
import { useEffect, useRef } from "react";
import type { Status } from "@/lib/ai/schemas";

export type Camera = { center: [number, number]; zoom: number; pitch: number; bearing: number };

export type CityIssue = {
  id: number;
  lng: number;
  lat: number;
  status: Status;
  severity: number;
  priority: number | null;
  backerCount: number;
  accessibility: "none" | "partial" | "major";
  incidentId: number | null;
  createdAt: string;
};

export type CityIncident = { id: number; lng: number; lat: number; radiusM: number; kind: "cluster" | "alert"; reportCount: number; title: string };

export type CityLayers = {
  issues?: boolean;
  priority?: boolean;
  health?: boolean;
  incidents?: boolean;
  arcs?: boolean;
  accessibility?: boolean;
};

type Props = {
  issues?: CityIssue[];
  incidents?: CityIncident[];
  route?: { coordinates: [number, number][]; recommended: boolean }[];
  layers?: CityLayers;
  initialCamera?: Camera;
  interactive?: boolean;
  /** 0..1, fades data layers in and out (landing chapters). */
  dataOpacity?: number;
  /** Multiplies column and hexagon heights (landing chapters). */
  elevation?: number;
  selectedIssueId?: number | null;
  /** Only show issues created at or before this time (time machine). */
  until?: number | null;
  onIssueClick?: (id: number) => void;
  onIncidentClick?: (id: number) => void;
  onHexClick?: (center: { lat: number; lng: number }) => void;
  onMapClick?: (p: { lat: number; lng: number }) => void;
  onReady?: (map: maplibregl.Map) => void;
  className?: string;
};

export const CITY_CAMERA: Camera = { center: [77.61, 12.965], zoom: 11.2, pitch: 55, bearing: -18 };
const STYLE = "https://tiles.openfreemap.org/styles/dark";

const STATUS_RGB: Record<Status, Color> = {
  open: [255, 106, 61],
  fix_claimed: [255, 181, 71],
  verified: [53, 224, 161],
};
const HEALTH_RANGE: Color[] = [
  [36, 52, 92],
  [74, 66, 140],
  [126, 82, 178],
  [190, 92, 160],
  [255, 106, 61],
  [255, 190, 90],
];

let workerConfigured = false;
const ON_TOP = { depthCompare: "always", depthWriteEnabled: false } as const;

function ringPoints(lng: number, lat: number, radiusM: number, steps = 48): [number, number][] {
  const out: [number, number][] = [];
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    out.push([lng + Math.cos(a) * dLng, lat + Math.sin(a) * dLat]);
  }
  return out;
}

export default function CityMap({
  issues = [],
  incidents = [],
  route = [],
  layers = { issues: true },
  initialCamera = CITY_CAMERA,
  interactive = true,
  dataOpacity = 1,
  elevation = 1,
  selectedIssueId = null,
  until = null,
  onIssueClick,
  onIncidentClick,
  onHexClick,
  onMapClick,
  onReady,
  className = "",
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const handlers = useRef({ onIssueClick, onIncidentClick, onHexClick, onMapClick, onReady });
  useEffect(() => {
    handlers.current = { onIssueClick, onIncidentClick, onHexClick, onMapClick, onReady };
  });

  // Map and overlay are created once; later prop changes only swap deck.gl layers.
  useEffect(() => {
    if (!containerRef.current) return;
    if (!workerConfigured) {
      maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      workerConfigured = true;
    }
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE,
      center: initialCamera.center,
      zoom: initialCamera.zoom,
      pitch: initialCamera.pitch,
      bearing: initialCamera.bearing,
      maxPitch: 78,
      interactive,
      attributionControl: { compact: true },
    });
    map.on("load", () => {
      tuneStyle(map);
      handlers.current.onReady?.(map);
    });
    map.on("click", (e) => handlers.current.onMapClick?.({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
    const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
    map.addControl(overlay);
    if (interactive) map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
    overlayRef.current = overlay;
    return () => {
      overlayRef.current = null;
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const shown = until === null ? issues : issues.filter((i) => new Date(i.createdAt).getTime() <= until);
    const open = shown.filter((i) => i.status !== "verified");
    const alpha = Math.round(255 * dataOpacity);
    const out: Layer[] = [];

    if (layers.health) {
      out.push(
        new HexagonLayer<CityIssue>({
          id: "health",
          data: open,
          getPosition: (d) => [d.lng, d.lat],
          getElevationWeight: (d) => (d.priority ?? 30) / 10 + d.backerCount * 0.3,
          getColorWeight: (d) => (d.priority ?? 30) / 10 + d.backerCount * 0.3,
          elevationAggregation: "SUM",
          colorAggregation: "SUM",
          radius: 420,
          coverage: 0.86,
          extruded: true,
          elevationRange: [0, 2400],
          elevationScale: elevation,
          colorRange: HEALTH_RANGE,
          opacity: 0.85 * dataOpacity,
          pickable: interactive,
          onClick: (info: PickingInfo) => {
            const pos = (info.object as { position?: [number, number] } | undefined)?.position;
            if (pos) handlers.current.onHexClick?.({ lng: pos[0], lat: pos[1] });
            return true;
          },
          updateTriggers: { getElevationWeight: [shown.length], getColorWeight: [shown.length] },
          transitions: { elevationScale: 600 },
        }),
      );
    }

    if (layers.priority) {
      out.push(
        new ColumnLayer<CityIssue>({
          id: "priority",
          data: open,
          getPosition: (d) => [d.lng, d.lat],
          getElevation: (d) => ((d.priority ?? 20) / 100) * 900 + d.backerCount * 20,
          getFillColor: (d) => [...(STATUS_RGB[d.status] as [number, number, number]), alpha] as Color,
          radius: 34,
          diskResolution: 18,
          extruded: true,
          elevationScale: elevation,
          pickable: interactive,
          onClick: (info: PickingInfo) => {
            if (info.object) handlers.current.onIssueClick?.((info.object as CityIssue).id);
            return true;
          },
          transitions: { elevationScale: 600, getElevation: 600 },
        }),
      );
    }

    if (layers.incidents && incidents.length) {
      out.push(
        new PathLayer<CityIncident>({
          id: "incident-rings",
          data: incidents,
          getPath: (d) => ringPoints(d.lng, d.lat, d.radiusM + 40),
          getColor: (d) => (d.kind === "alert" ? [255, 61, 110, alpha] : [167, 139, 250, alpha]),
          getWidth: 3,
          widthUnits: "pixels",
          parameters: ON_TOP,
          pickable: interactive,
          onClick: (info: PickingInfo) => {
            if (info.object) handlers.current.onIncidentClick?.((info.object as CityIncident).id);
            return true;
          },
        }),
        new TextLayer<CityIncident>({
          id: "incident-labels",
          data: incidents,
          getPosition: (d) => [d.lng, d.lat + (d.radiusM + 90) / 111_320],
          getText: (d) => `${d.kind === "alert" ? "ALERT" : "INCIDENT"} · ${d.reportCount}`,
          getColor: (d) => (d.kind === "alert" ? [255, 61, 110, alpha] : [196, 181, 253, alpha]),
          getSize: 12,
          fontFamily: "JetBrains Mono, monospace",
          fontWeight: 600,
          parameters: ON_TOP,
          characterSet: "auto",
        }),
      );
    }

    if (layers.arcs && incidents.length) {
      const arcs = open
        .filter((i) => i.incidentId !== null)
        .map((i) => ({ from: [i.lng, i.lat] as [number, number], inc: incidents.find((n) => n.id === i.incidentId) }))
        .filter((a): a is { from: [number, number]; inc: CityIncident } => !!a.inc);
      out.push(
        new ArcLayer<(typeof arcs)[number]>({
          id: "evidence-arcs",
          data: arcs,
          getSourcePosition: (d) => d.from,
          getTargetPosition: (d) => [d.inc.lng, d.inc.lat],
          getSourceColor: [255, 106, 61, alpha],
          getTargetColor: [167, 139, 250, alpha],
          getWidth: 2,
          getHeight: 0.6,
        }),
      );
    }

    if (route.length) {
      out.push(
        new PathLayer<(typeof route)[number]>({
          id: "routes",
          data: [...route].sort((a, b) => Number(a.recommended) - Number(b.recommended)),
          getPath: (d) => d.coordinates,
          getColor: (d) => (d.recommended ? [56, 211, 245, 255] : [97, 108, 130, 200]),
          getWidth: (d) => (d.recommended ? 6 : 3),
          widthUnits: "pixels",
          capRounded: true,
          jointRounded: true,
          parameters: ON_TOP,
        }),
      );
    }

    if (layers.accessibility) {
      const blocked = open.filter((i) => i.accessibility !== "none");
      out.push(
        new ScatterplotLayer<CityIssue>({
          id: "access",
          data: blocked,
          getPosition: (d) => [d.lng, d.lat],
          getRadius: (d) => (d.accessibility === "major" ? 70 : 45),
          radiusMinPixels: 6,
          getFillColor: (d) => (d.accessibility === "major" ? [255, 61, 110, 90] : [255, 181, 71, 80]),
          getLineColor: [56, 211, 245, 255],
          stroked: true,
          lineWidthMinPixels: 2,
          parameters: ON_TOP,
          pickable: interactive,
          onClick: (info: PickingInfo) => {
            if (info.object) handlers.current.onIssueClick?.((info.object as CityIssue).id);
            return true;
          },
        }),
      );
    }

    if (layers.issues) {
      out.push(
        new ScatterplotLayer<CityIssue>({
          id: "issues",
          data: shown,
          getPosition: (d) => [d.lng, d.lat],
          getRadius: (d) => 18 + Math.min(40, d.backerCount * 4),
          radiusMinPixels: 4,
          radiusMaxPixels: 22,
          getFillColor: (d) => [...(STATUS_RGB[d.status] as [number, number, number]), d.id === selectedIssueId ? 255 : Math.round(alpha * 0.9)] as Color,
          getLineColor: (d) => (d.id === selectedIssueId ? [238, 242, 248, 255] : [5, 7, 12, alpha]),
          stroked: true,
          lineWidthMinPixels: 1.5,
          parameters: ON_TOP,
          pickable: interactive,
          onClick: (info: PickingInfo) => {
            if (info.object) handlers.current.onIssueClick?.((info.object as CityIssue).id);
            return true;
          },
          updateTriggers: { getFillColor: [selectedIssueId, alpha], getLineColor: [selectedIssueId, alpha] },
          transitions: { getRadius: 400 },
        }),
      );
    }

    overlay.setProps({ layers: out, getCursor: ({ isHovering }) => (isHovering ? "pointer" : "grab") });
  }, [issues, incidents, route, layers, dataOpacity, elevation, selectedIssueId, until, interactive]);

  return <div ref={containerRef} className={`h-full w-full ${className}`} />;
}

/** Recolours the dark base style to the UrbanTrace night palette and adds 3D buildings. */
function tuneStyle(map: maplibregl.Map) {
  const set = (id: string, prop: string, value: unknown) => {
    if (map.getLayer(id)) (map.setPaintProperty as (l: string, p: string, v: unknown) => void).call(map, id, prop, value);
  };
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type === "background") set(layer.id, "background-color", "#06090f");
    if (layer.type === "fill" && /water/.test(layer.id)) set(layer.id, "fill-color", "#0b1830");
    if (layer.type === "fill" && /park|landuse|landcover/.test(layer.id)) set(layer.id, "fill-opacity", 0.35);
    if (layer.type === "line" && /road|highway|street|transport/.test(layer.id)) set(layer.id, "line-color", "#232c3d");
    if (layer.type === "symbol") set(layer.id, "text-color", "#7f8aa1");
  }
  if (map.getLayer("building")) map.setLayoutProperty("building", "visibility", "none");
  const firstSymbol = map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
  if (!map.getLayer("ut-buildings") && map.getSource("openmaptiles")) {
    map.addLayer(
      {
        id: "ut-buildings",
        type: "fill-extrusion",
        source: "openmaptiles",
        "source-layer": "building",
        minzoom: 12,
        paint: {
          "fill-extrusion-color": ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], 8], 0, "#141b29", 40, "#1d2738", 120, "#2b3649"],
          "fill-extrusion-height": ["coalesce", ["get", "render_height"], 8],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-opacity": 0.9,
        },
      },
      firstSymbol,
    );
  }
}
