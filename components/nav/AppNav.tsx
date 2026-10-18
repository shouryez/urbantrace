import Link from "next/link";
import { Camera, ChartColumn, House, Map } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { NavLink } from "./NavLink";

// The full screen map sits above these bars (z-50), so it keeps its own glass filter bar.

export function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2 font-display text-lg font-bold tracking-[-0.02em]">
      <span aria-hidden className="flex items-center gap-[3px]">
        <span className="size-2 rounded-full bg-marking-400" />
        <span className="size-1 rounded-full bg-marking-400/60" />
        <span className="size-1 rounded-full bg-marking-400/60" />
      </span>
      UrbanTrace
    </Link>
  );
}

const topLink = "text-sm font-medium transition-opacity duration-150 ease-out hover:opacity-100";

/** Desktop: glass top bar. */
export function TopBar() {
  return (
    <header className="no-print sticky top-0 z-40 hidden border-b border-white/6 bg-asphalt-900/72 backdrop-blur-[16px] md:block">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6" aria-label="Main">
        <Wordmark />
        <div className="flex items-center gap-6">
          <NavLink href="/" className={topLink} idle="opacity-70" current="opacity-100">
            Home
          </NavLink>
          <NavLink href="/map" className={topLink} idle="opacity-70" current="opacity-100">
            Live map
          </NavLink>
          <NavLink href="/dashboard" className={topLink} idle="opacity-70" current="opacity-100">
            Dashboard
          </NavLink>
          <Link href="/report" className={buttonClasses("primary")}>
            <Camera size={16} strokeWidth={1.75} aria-hidden /> Report an issue
          </Link>
        </div>
      </nav>
    </header>
  );
}

const tab = "flex flex-1 flex-col items-center gap-1 py-2 text-xs font-medium transition-opacity duration-150 ease-out";

/** Phones: bottom tab bar with a raised yellow camera button in the middle for Report. */
export function TabBar() {
  return (
    <>
      {/* keeps page content clear of the fixed bar */}
      <div aria-hidden className="no-print h-20 md:hidden" />
      <nav
        aria-label="Main"
        className="no-print fixed inset-x-0 bottom-0 z-40 flex items-end border-t border-white/6 bg-asphalt-900/72 px-4 pb-[env(safe-area-inset-bottom)] backdrop-blur-[16px] md:hidden"
      >
        <div className="flex flex-1">
          <NavLink href="/" className={tab} idle="text-mist-300" current="text-marking-400">
            <House size={22} strokeWidth={1.75} aria-hidden />
            Home
          </NavLink>
          <NavLink href="/map" className={tab} idle="text-mist-300" current="text-marking-400">
            <Map size={22} strokeWidth={1.75} aria-hidden />
            Map
          </NavLink>
        </div>
        <NavLink
          href="/report"
          label="Report an issue"
          className="-mt-6 mb-2 flex size-16 shrink-0 items-center justify-center rounded-full border-4 border-asphalt-950 bg-marking-400 text-asphalt-950 transition-transform duration-150 ease-out active:scale-[0.97]"
          idle=""
          current=""
        >
          <Camera size={26} strokeWidth={1.75} aria-hidden />
        </NavLink>
        <div className="flex flex-1">
          <NavLink href="/dashboard" className={tab} idle="text-mist-300" current="text-marking-400">
            <ChartColumn size={22} strokeWidth={1.75} aria-hidden />
            Dashboard
          </NavLink>
        </div>
      </nav>
    </>
  );
}
