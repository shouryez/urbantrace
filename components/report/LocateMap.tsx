"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";
import { OSM_ATTRIBUTION, OSM_TILES, type LatLng } from "@/lib/geo";

type LocateMapProps = {
  position: LatLng;
  /** GPS accuracy in metres, drawn as a ring; null hides it. */
  accuracy: number | null;
  draggable: boolean;
  onMove: (position: LatLng) => void;
};

const pinIcon = L.divIcon({
  className: "",
  html: '<span class="locate-pin" aria-hidden="true"></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

/** Small Leaflet map for the Locate step. Client only: Leaflet needs `window`. */
export default function LocateMap({ position, accuracy, draggable, onMove }: LocateMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const ringRef = useRef<L.Circle | null>(null);
  const draggableRef = useRef(draggable);
  const onMoveRef = useRef(onMove);

  useEffect(() => {
    onMoveRef.current = onMove;
    draggableRef.current = draggable;
  });

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: false }).setView(position, 17);
    L.tileLayer(OSM_TILES, { maxZoom: 19, attribution: OSM_ATTRIBUTION, className: "map-tiles-dark" }).addTo(map);
    const ring = L.circle(position, {
      radius: 0,
      color: "#F5B700",
      weight: 1,
      fillColor: "#F5B700",
      fillOpacity: 0.12,
      interactive: false,
    }).addTo(map);
    const marker = L.marker(position, { icon: pinIcon, draggable: false, keyboard: false }).addTo(map);
    marker.on("dragend", () => {
      const { lat, lng } = marker.getLatLng();
      onMoveRef.current({ lat, lng });
    });
    map.on("click", (e: L.LeafletMouseEvent) => {
      if (!draggableRef.current) return;
      marker.setLatLng(e.latlng);
      onMoveRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
    });
    mapRef.current = map;
    markerRef.current = marker;
    ringRef.current = ring;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Position updates are handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    markerRef.current?.setLatLng(position);
    ringRef.current?.setLatLng(position);
    mapRef.current?.panTo(position);
  }, [position]);

  useEffect(() => {
    ringRef.current?.setRadius(accuracy ?? 0);
  }, [accuracy]);

  useEffect(() => {
    const dragging = markerRef.current?.dragging;
    if (draggable) dragging?.enable();
    else dragging?.disable();
  }, [draggable]);

  return <div ref={containerRef} className="h-full w-full" />;
}
