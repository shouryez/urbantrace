"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";
import { OSM_ATTRIBUTION, OSM_TILES, type LatLng } from "@/lib/geo";

// The pin drops with a spring-like overshoot, then a yellow ring bursts once around it.
const dropIcon = L.divIcon({
  className: "",
  html: '<span class="pin-drop-in" aria-hidden="true"><span class="locate-pin"></span></span><span class="ring-burst" aria-hidden="true"></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

/** Still map on the Done step with the report's pin dropping in. Client only. */
export default function DoneMap({ position }: { position: LatLng }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
      boxZoom: false,
      keyboard: false,
    }).setView(position, 16);
    L.tileLayer(OSM_TILES, { maxZoom: 19, attribution: OSM_ATTRIBUTION, className: "map-tiles-dark" }).addTo(map);
    L.marker(position, { icon: dropIcon, interactive: false, keyboard: false }).addTo(map);
    return () => {
      map.remove();
    };
  }, [position]);

  return <div ref={containerRef} className="h-full w-full" />;
}
