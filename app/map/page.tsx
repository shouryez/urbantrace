import type { Metadata } from "next";
import { MapExplorer } from "@/components/map/MapExplorer";

export const metadata: Metadata = {
  title: "Live map · UrbanTrace",
};

export default function MapPage() {
  return (
    <main className="fixed inset-0 z-50">
      <MapExplorer />
    </main>
  );
}
