"use client";

import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import L from "leaflet";
import { useEffect, useRef, useState } from "react";
import { BENGALURU, OSM_ATTRIBUTION, OSM_TILES } from "@/lib/geo";
import type { IssueFeature } from "@/lib/issues";
import { MAP_PIN_SIZE, mapPinHtml } from "./MapPin";

declare global {
  interface Window {
    L?: typeof L;
  }
}

export type Bbox = [minLng: number, minLat: number, maxLng: number, maxLat: number];

type MapViewProps = {
  issues: IssueFeature[];
  /** Pin linked to the hovered list card. */
  activeId: number | null;
  /** Pin opened from the list: the map brings it into view. */
  selectedId: number | null;
  freshIds: ReadonlySet<number>;
  onBoundsChange: (bbox: Bbox) => void;
  onHover: (id: number | null) => void;
  onSelect: (id: number) => void;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Public map (F3): Leaflet used directly, client only. */
export default function MapView({ issues, activeId, selectedId, freshIds, onBoundsChange, onHover, onSelect }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const markersRef = useRef(new Map<number, { marker: L.Marker; html: string }>());
  const callbacks = useRef({ onBoundsChange, onHover, onSelect });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    callbacks.current = { onBoundsChange, onHover, onSelect };
  });

  // Create the map once. leaflet.markercluster extends the global L, so load it after setting it.
  useEffect(() => {
    let cancelled = false;
    let map: L.Map | null = null;
    window.L = L;
    void import("leaflet.markercluster").then(() => {
      if (cancelled || !containerRef.current) return;
      map = L.map(containerRef.current, { zoomControl: false, minZoom: 4 }).setView(BENGALURU, 12);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer(OSM_TILES, { maxZoom: 19, attribution: OSM_ATTRIBUTION, className: "map-tiles-dark" }).addTo(map);
      const cluster = L.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 50,
        iconCreateFunction: (c) =>
          L.divIcon({ html: `<span class="map-cluster">${c.getChildCount()}</span>`, className: "", iconSize: [40, 40] }),
      });
      map.addLayer(cluster);

      const emit = () => {
        if (!map) return;
        const b = map.getBounds();
        callbacks.current.onBoundsChange([
          clamp(b.getWest(), -180, 180),
          clamp(b.getSouth(), -90, 90),
          clamp(b.getEast(), -180, 180),
          clamp(b.getNorth(), -90, 90),
        ]);
      };
      map.on("moveend", emit);
      emit();

      mapRef.current = map;
      clusterRef.current = cluster;
      setReady(true);
    });
    const markers = markersRef.current;
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      clusterRef.current = null;
      markers.clear();
    };
  }, []);

  // Sync markers with the issues and their pin state.
  useEffect(() => {
    const cluster = clusterRef.current;
    if (!ready || !cluster) return;
    const markers = markersRef.current;
    const seen = new Set<number>();
    const added: L.Marker[] = [];

    for (const f of issues) {
      const { id, status, backerCount } = f.properties;
      const [lng, lat] = f.geometry.coordinates;
      const html = mapPinHtml(status, backerCount, { active: id === activeId || id === selectedId, fresh: freshIds.has(id) });
      const icon = L.divIcon({ html, className: "", iconSize: [MAP_PIN_SIZE, MAP_PIN_SIZE] });
      seen.add(id);

      const existing = markers.get(id);
      if (existing) {
        existing.marker.setLatLng([lat, lng]);
        if (existing.html !== html) {
          existing.marker.setIcon(icon);
          existing.html = html;
        }
        continue;
      }
      const marker = L.marker([lat, lng], { icon, keyboard: true, title: `Issue ${id}` });
      marker.on("click", () => callbacks.current.onSelect(id));
      marker.on("mouseover", () => callbacks.current.onHover(id));
      marker.on("mouseout", () => callbacks.current.onHover(null));
      markers.set(id, { marker, html });
      added.push(marker);
    }
    if (added.length) cluster.addLayers(added);

    const removed: L.Marker[] = [];
    for (const [id, { marker }] of markers) {
      if (!seen.has(id)) {
        removed.push(marker);
        markers.delete(id);
      }
    }
    if (removed.length) cluster.removeLayers(removed);
  }, [ready, issues, activeId, selectedId, freshIds]);

  // Bring a pin chosen from the list into view, opening its cluster if needed.
  useEffect(() => {
    if (!ready || selectedId === null) return;
    const entry = markersRef.current.get(selectedId);
    if (entry) clusterRef.current?.zoomToShowLayer(entry.marker);
  }, [ready, selectedId]);

  return <div ref={containerRef} className="h-full w-full" />;
}
