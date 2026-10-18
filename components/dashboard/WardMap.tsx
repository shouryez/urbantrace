"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";
import { BENGALURU, OSM_ATTRIBUTION, OSM_TILES } from "@/lib/geo";
import type { WardStat } from "@/lib/dashboard";

type WardMapProps = {
  wards: WardStat[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
};

// Shaded in the open status colour: the more open issues, the stronger the fill.
const OPEN = "#E2512B";
const MARKING = "#F5B700";

function style(ward: WardStat, maxOpen: number, selected: boolean): L.PathOptions {
  return {
    color: selected ? MARKING : "#5E6773",
    weight: selected ? 3 : 1,
    fillColor: OPEN,
    fillOpacity: ward.open === 0 ? 0.04 : 0.15 + 0.55 * (ward.open / maxOpen),
  };
}

/** F10: the ward map shaded by open issues; clicking a ward filters the dashboard to it. Client only. */
export default function WardMap({ wards, selectedId, onSelect }: WardMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef(new Map<number, L.Path>());
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  });
  const maxOpen = Math.max(1, ...wards.map((w) => w.open));

  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: false, scrollWheelZoom: false }).setView([BENGALURU.lat, BENGALURU.lng], 11);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.tileLayer(OSM_TILES, { maxZoom: 19, attribution: OSM_ATTRIBUTION, className: "map-tiles-dark" }).addTo(map);
    const layers = layersRef.current;
    const group = L.featureGroup();
    for (const ward of wards) {
      const layer = L.geoJSON(ward.geometry, { style: style(ward, maxOpen, false) });
      layer.bindTooltip(`${ward.name}: ${ward.open} open`, { sticky: true });
      layer.on("click", () => onSelectRef.current(ward.id));
      layer.eachLayer((l) => layers.set(ward.id, l as L.Path));
      group.addLayer(layer);
    }
    group.addTo(map);
    if (wards.length) map.fitBounds(group.getBounds(), { padding: [16, 16] });
    map.on("click", (e) => {
      // A click outside every ward clears the selection.
      if (!(e.originalEvent.target instanceof SVGPathElement)) onSelectRef.current(null);
    });
    return () => {
      map.remove();
      layers.clear();
    };
  }, [wards, maxOpen]);

  useEffect(() => {
    for (const ward of wards) {
      const layer = layersRef.current.get(ward.id);
      if (!layer) continue;
      layer.setStyle(style(ward, maxOpen, ward.id === selectedId));
      if (ward.id === selectedId) layer.bringToFront();
    }
  }, [wards, maxOpen, selectedId]);

  return <div ref={containerRef} className="h-full w-full" />;
}
