// Camera keyframes and data layers for each landing chapter. The bearing keeps turning, so the
// scroll reads as one long orbit over the city.
import type { Camera, CityLayers } from "@/components/city/CityMap";

export type Chapter = { id: string; label: string; cam: Camera; layers: CityLayers; elevation: number; opacity: number };

export const CHAPTERS: Chapter[] = [
  { id: "top", label: "Bengaluru", cam: { center: [77.6, 12.962], zoom: 11.1, pitch: 58, bearing: -24 }, layers: { health: true, issues: true }, elevation: 1, opacity: 0.85 },
  { id: "investigate", label: "Investigator", cam: { center: [77.6412, 12.9716], zoom: 15.4, pitch: 66, bearing: 22 }, layers: { issues: true }, elevation: 0.2, opacity: 1 },
  { id: "cause", label: "Root cause", cam: { center: [77.637, 12.967], zoom: 13.9, pitch: 60, bearing: 64 }, layers: { issues: true, incidents: true, arcs: true }, elevation: 0.3, opacity: 1 },
  { id: "incidents", label: "Incidents", cam: { center: [77.62, 12.955], zoom: 12.4, pitch: 52, bearing: 104 }, layers: { incidents: true, issues: true }, elevation: 0.3, opacity: 1 },
  { id: "proof", label: "Proof of fix", cam: { center: [77.6, 12.97], zoom: 12.9, pitch: 48, bearing: 140 }, layers: { issues: true }, elevation: 0.2, opacity: 0.9 },
  { id: "time", label: "Time machine", cam: { center: [77.61, 12.96], zoom: 11.9, pitch: 56, bearing: 176 }, layers: { issues: true, health: true }, elevation: 0.7, opacity: 0.9 },
  { id: "priority", label: "Priority", cam: { center: [77.615, 12.958], zoom: 12.6, pitch: 64, bearing: 214 }, layers: { priority: true }, elevation: 1.4, opacity: 1 },
  { id: "access", label: "Accessibility", cam: { center: [77.6245, 12.9352], zoom: 14.6, pitch: 58, bearing: 250 }, layers: { accessibility: true, issues: true }, elevation: 0.3, opacity: 1 },
  { id: "open", label: "Open source", cam: { center: [77.62, 12.96], zoom: 10.8, pitch: 44, bearing: 290 }, layers: { health: true, issues: true }, elevation: 1, opacity: 0.8 },
];

const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Camera at scroll position x, measured in chapters (0 = top of the first). */
export function cameraAt(x: number): Camera {
  const max = CHAPTERS.length - 1;
  const cx = Math.min(Math.max(x, 0), max);
  const i = Math.min(Math.floor(cx), max - 1);
  const t = smooth(cx - i);
  const a = CHAPTERS[i]!.cam;
  const b = CHAPTERS[i + 1]!.cam;
  return {
    center: [lerp(a.center[0], b.center[0], t), lerp(a.center[1], b.center[1], t)],
    zoom: lerp(a.zoom, b.zoom, t),
    pitch: lerp(a.pitch, b.pitch, t),
    bearing: lerp(a.bearing, b.bearing, t),
  };
}
