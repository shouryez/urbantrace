// The app's sections, in one place, so the desktop bar, the phone tab bar and the landing header agree.
import { Building2, ChartColumn, Map, Network, ShieldCheck, UserRound, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; Icon: LucideIcon; /** Also active on these path prefixes. */ also?: string[] };

export const NAV: NavItem[] = [
  { href: "/map", label: "Live city", Icon: Map },
  { href: "/incidents", label: "Incidents", Icon: Network, also: ["/incident/"] },
  { href: "/wards", label: "Wards", Icon: Building2, also: ["/ward/"] },
  { href: "/dashboard", label: "Dashboard", Icon: ChartColumn },
  { href: "/authority", label: "Authority", Icon: ShieldCheck },
];

/** The account and personal pages: my reports, my impact, sign in. */
export const ME: NavItem = { href: "/me", label: "Me", Icon: UserRound, also: ["/impact", "/account"] };

/** Phone tab bar: two sections, the report button, two more. */
export const TABS: [NavItem, NavItem, NavItem, NavItem] = [NAV[0]!, NAV[1]!, NAV[2]!, ME];

export function isActive(item: NavItem, pathname: string): boolean {
  return pathname === item.href || pathname.startsWith(`${item.href}/`) || (item.also ?? []).some((p) => pathname.startsWith(p));
}
