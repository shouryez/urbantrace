"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";
import { MAP_PIN_SIZE, mapPinHtml } from "@/components/map/MapPin";
import { BENGALURU, OSM_ATTRIBUTION, OSM_TILES } from "@/lib/geo";
import type { IssueFeature } from "@/lib/issues";

type LiveMapStripProps = {
  issues: IssueFeature[];
  /** Pins drop in one by one once this turns true (the strip is in view). */
  play: boolean;
  reduce: boolean;
};

/** A still strip of the real map with real pins, for the landing page. */
export default function LiveMapStrip({ issues, play, reduce }: LiveMapStripProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current, {
      center: [BENGALURU.lat, BENGALURU.lng],
      zoom: 12,
      zoomControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
      boxZoom: false,
      keyboard: false,
    });
    L.tileLayer(OSM_TILES, { maxZoom: 19, attribution: OSM_ATTRIBUTION, className: "map-tiles-dark" }).addTo(map);
    const points = issues.map((f) => L.latLng(f.geometry.coordinates[1], f.geometry.coordinates[0]));
    if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 15 });
    else if (points[0]) map.setView(points[0], 15);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [issues]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !play) return;
    const markers = issues.map((f, i) => {
      const delay = reduce ? 0 : i * 120;
      const html = `<span class="pin-drop-in" style="animation-delay:${delay}ms">${mapPinHtml(f.properties.status, f.properties.backerCount)}</span>`;
      const icon = L.divIcon({ html, className: "", iconSize: [MAP_PIN_SIZE, MAP_PIN_SIZE], iconAnchor: [MAP_PIN_SIZE / 2, MAP_PIN_SIZE / 2] });
      return L.marker([f.geometry.coordinates[1], f.geometry.coordinates[0]], { icon, interactive: false, keyboard: false }).addTo(map);
    });
    return () => markers.forEach((m) => m.remove());
  }, [issues, play, reduce]);

  return <div ref={containerRef} className="h-full w-full" />;
}
