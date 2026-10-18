"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { BENGALURU, MAX_GPS_ACCURACY_M, type LatLng } from "@/lib/geo";

const LocateMap = dynamic(() => import("./LocateMap"), {
  ssr: false,
  loading: () => <div className="skeleton h-full w-full" />,
});

type GpsState =
  | { kind: "locating" }
  | { kind: "fix"; accuracy: number }
  | { kind: "failed"; reason: string };

type LocateProps = {
  onConfirm: (position: LatLng) => void;
  onBack: () => void;
};

export function Locate({ onConfirm, onBack }: LocateProps) {
  const [position, setPosition] = useState<LatLng>(BENGALURU);
  const [gps, setGps] = useState<GpsState>({ kind: "locating" });
  const [manual, setManual] = useState(false);

  useEffect(() => {
    const fail = (reason: string) => {
      setGps({ kind: "failed", reason });
      setManual(true);
    };
    if (!("geolocation" in navigator)) {
      queueMicrotask(() => fail("This browser cannot share its location."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPosition({ lat: p.coords.latitude, lng: p.coords.longitude });
        setGps({ kind: "fix", accuracy: p.coords.accuracy });
        if (p.coords.accuracy > MAX_GPS_ACCURACY_M) setManual(true);
      },
      (err) =>
        fail(err.code === err.PERMISSION_DENIED ? "Location permission was denied." : "Could not get a GPS fix."),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }, []);

  const accuracy = gps.kind === "fix" && !manual ? gps.accuracy : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-[22px] font-semibold">Where is it?</h2>
        <p className="text-sm text-mist-300" aria-live="polite">
          {gps.kind === "locating" && "Finding your location…"}
          {gps.kind === "fix" && (
            <>
              GPS fix <span className="font-mono text-chalk-50">±{Math.round(gps.accuracy)} m</span>
              {gps.accuracy > MAX_GPS_ACCURACY_M && ", not precise enough."}
            </>
          )}
          {gps.kind === "failed" && gps.reason}
          {manual && " Drag the pin, or tap the map, to where the problem is."}
        </p>
      </div>

      <div className="relative h-80 overflow-hidden rounded-photo border border-white/6">
        <LocateMap position={position} accuracy={accuracy} draggable={manual} onMove={setPosition} />
      </div>

      <p className="font-mono text-xs text-mist-300">
        {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => onConfirm(position)} disabled={gps.kind === "locating" && !manual}>
          Use this location
        </Button>
        {!manual && gps.kind === "fix" && (
          <Button variant="secondary" onClick={() => setManual(true)}>
            Move pin by hand
          </Button>
        )}
        {gps.kind === "locating" && (
          <Button variant="secondary" onClick={() => setManual(true)}>
            Drop a pin instead
          </Button>
        )}
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
      </div>
    </div>
  );
}
