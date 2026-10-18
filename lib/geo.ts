export type LatLng = { lat: number; lng: number };

/** Centre of Bengaluru, used when there is no GPS fix yet. */
export const BENGALURU: LatLng = { lat: 12.9716, lng: 77.5946 };

/** A GPS fix worse than this needs the manual pin (F1). */
export const MAX_GPS_ACCURACY_M = 50;

export const OSM_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
