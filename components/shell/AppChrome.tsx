"use client";

// App navigation on every page: a floating glass bar on desktop; on phones a top bar with the full
// menu and a bottom tab bar with the report button. Over the landing page and the full screen city map
// the bar floats (fixed) instead of taking space. Only this leaf reads the pathname, inside Suspense,
// so pages still prerender.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Camera, Menu, X } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { Logo } from "@/components/home/HomeExperience";
import { isActive, ME, NAV, TABS, type NavItem } from "@/lib/nav";
import { Backdrop } from "./Backdrop";

type Account = { name: string } | null;

/** The signed in user's name for the bar; null when signed out. */
function useAccount(pathname: string): Account {
  const [account, setAccount] = useState<Account>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/account")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { user: { name: string } | null } | null) => live && setAccount(d?.user ?? null))
      .catch(() => live && setAccount(null));
    return () => {
      live = false;
    };
  }, [pathname]);
  return account;
}

function Chrome() {
  const pathname = usePathname();
  const [menu, setMenu] = useState<string | null>(null);
  const account = useAccount(pathname);
  const floating = pathname === "/" || pathname.startsWith("/map");
  const menuOpen = menu === pathname; // closes itself on navigation

  const meLabel = account ? account.name.split(" ")[0]! : "Sign in";
  return (
    <>
      {!floating && <Backdrop />}
      <header className={`no-print top-0 z-40 px-3 pt-3 md:px-6 md:pt-4 ${floating ? "fixed inset-x-0" : "sticky"}`}>
        <nav aria-label="Main" className="glass mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 rounded-full pr-2 pl-4">
          <Logo />
          <div className="hidden items-center gap-1 lg:flex">
            {NAV.map((item) => (
              <TopLink key={item.href} item={item} on={isActive(item, pathname)} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={ME.href}
              aria-current={isActive(ME, pathname) ? "page" : undefined}
              className={`hidden h-10 items-center gap-2 rounded-full border px-3 text-sm font-bold sm:flex ${isActive(ME, pathname) ? "border-white/20 bg-white/10" : "border-white/10 text-fog-200 hover:text-fog-50"}`}
            >
              <span aria-hidden className="flex size-6 items-center justify-center rounded-full bg-[conic-gradient(from_200deg,#a78bfa,#38d3f5,#a78bfa)] text-[11px] font-extrabold text-ink-950">
                {account ? account.name.slice(0, 1).toUpperCase() : <ME.Icon size={13} />}
              </span>
              {meLabel}
            </Link>
            <Link href="/report" className="hidden h-10 items-center gap-2 rounded-full bg-signal px-5 text-sm font-extrabold text-ink-950 transition-transform hover:-translate-y-0.5 sm:flex">
              <Camera size={16} aria-hidden /> Report
            </Link>
            <button
              type="button"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              onClick={() => setMenu(menuOpen ? null : pathname)}
              className="flex size-10 items-center justify-center rounded-full border border-white/10 lg:hidden"
            >
              {menuOpen ? <X size={18} aria-hidden /> : <Menu size={18} aria-hidden />}
            </button>
          </div>
        </nav>
        {menuOpen && (
          <div className="glass mx-auto mt-2 grid max-w-6xl grid-cols-2 gap-2 rounded-3xl p-3 sm:grid-cols-3 lg:hidden">
            {[...NAV, ME].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenu(null)}
                aria-current={isActive(item, pathname) ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-bold ${isActive(item, pathname) ? "bg-white/10 text-fog-50" : "text-fog-200 hover:bg-white/5"}`}
              >
                <item.Icon size={18} aria-hidden /> {item === ME ? meLabel : item.label}
              </Link>
            ))}
            <Link href="/report" onClick={() => setMenu(null)} className="col-span-2 flex items-center justify-center gap-2 rounded-2xl bg-signal px-4 py-3 text-sm font-extrabold text-ink-950 sm:col-span-3">
              <Camera size={18} aria-hidden /> Report an issue
            </Link>
          </div>
        )}
      </header>
      {!floating && <div aria-hidden className="no-print h-2 md:h-0" />}
      <nav aria-label="Sections" className="glass no-print fixed inset-x-3 bottom-3 z-40 flex items-end justify-around rounded-3xl px-2 pb-[env(safe-area-inset-bottom)] md:hidden">
        {TABS.slice(0, 2).map((item) => (
          <Tab key={item.href} item={item} on={isActive(item, pathname)} />
        ))}
        <Link href="/report" aria-label="Report an issue" className="-mt-5 mb-2 flex size-15 items-center justify-center rounded-full border-4 border-ink-950 bg-signal text-ink-950 shadow-[0_8px_30px_-6px_#d9ff4a] transition-transform active:scale-95">
          <Camera size={24} aria-hidden />
        </Link>
        {TABS.slice(2).map((item) => (
          <Tab key={item.href} item={item} on={isActive(item, pathname)} label={item === ME ? meLabel : undefined} />
        ))}
      </nav>
    </>
  );
}

function TopLink({ item, on }: { item: NavItem; on: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={on ? "page" : undefined}
      className={`rounded-full px-3.5 py-2 text-sm font-bold transition-colors ${on ? "bg-white/10 text-fog-50" : "text-fog-300 hover:text-fog-50"}`}
    >
      {item.label}
    </Link>
  );
}

function Tab({ item, on, label }: { item: NavItem; on: boolean; label?: string }) {
  return (
    <Link href={item.href} aria-current={on ? "page" : undefined} className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-bold ${on ? "text-signal" : "text-fog-300"}`}>
      <item.Icon size={21} strokeWidth={1.9} aria-hidden />
      {label ?? item.label}
    </Link>
  );
}

export function AppChrome() {
  return (
    <Suspense fallback={null}>
      <Chrome />
    </Suspense>
  );
}
