"use client";

// App navigation: a floating glass bar on desktop and a bottom tab bar on phones. The landing page
// and the full screen city map have their own controls, so the chrome stays out of them. Only this
// leaf reads the pathname, inside Suspense, so pages still prerender.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Camera, ChartColumn, Map, Network, ShieldCheck, Sparkles } from "lucide-react";
import { Suspense } from "react";
import { Logo } from "@/components/home/HomeExperience";
import { Backdrop } from "./Backdrop";

const LINKS = [
  { href: "/map", label: "Live city", Icon: Map },
  { href: "/incidents", label: "Incidents", Icon: Network },
  { href: "/dashboard", label: "Dashboard", Icon: ChartColumn },
  { href: "/impact", label: "Impact", Icon: Sparkles },
  { href: "/authority", label: "Authority", Icon: ShieldCheck },
];

const bare = (p: string) => p === "/" || p.startsWith("/map");

function Chrome() {
  const pathname = usePathname();
  if (bare(pathname)) return null;
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`) || (href === "/incidents" && pathname.startsWith("/incident/"));
  return (
    <>
      <Backdrop />
      <header className="no-print sticky top-0 z-40 hidden px-6 pt-4 md:block">
        <nav aria-label="Main" className="glass mx-auto flex h-14 max-w-6xl items-center justify-between rounded-full pr-2 pl-4">
          <Logo />
          <div className="flex items-center gap-1">
            {LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                aria-current={active(href) ? "page" : undefined}
                className={`rounded-full px-3.5 py-2 text-sm font-bold transition-colors ${active(href) ? "bg-white/10 text-fog-50" : "text-fog-300 hover:text-fog-50"}`}
              >
                {label}
              </Link>
            ))}
            <Link href="/report" className="ml-2 flex h-10 items-center gap-2 rounded-full bg-signal px-5 text-sm font-extrabold text-ink-950 transition-transform hover:-translate-y-0.5">
              <Camera size={16} aria-hidden /> Report
            </Link>
          </div>
        </nav>
      </header>
      <div aria-hidden className="no-print h-20 md:hidden" />
      <nav aria-label="Main" className="glass no-print fixed inset-x-3 bottom-3 z-40 flex items-end justify-around rounded-3xl px-2 pb-[env(safe-area-inset-bottom)] md:hidden">
        {[LINKS[0]!, LINKS[1]!].map(({ href, label, Icon }) => (
          <Tab key={href} href={href} label={label} Icon={Icon} on={active(href)} />
        ))}
        <Link href="/report" aria-label="Report an issue" className="-mt-5 mb-2 flex size-15 items-center justify-center rounded-full border-4 border-ink-950 bg-signal text-ink-950 shadow-[0_8px_30px_-6px_#d9ff4a] transition-transform active:scale-95">
          <Camera size={24} aria-hidden />
        </Link>
        {[LINKS[2]!, LINKS[3]!].map(({ href, label, Icon }) => (
          <Tab key={href} href={href} label={label} Icon={Icon} on={active(href)} />
        ))}
      </nav>
    </>
  );
}

function Tab({ href, label, Icon, on }: { href: string; label: string; Icon: typeof Map; on: boolean }) {
  return (
    <Link href={href} aria-current={on ? "page" : undefined} className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-bold ${on ? "text-signal" : "text-fog-300"}`}>
      <Icon size={21} strokeWidth={1.9} aria-hidden />
      {label}
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
