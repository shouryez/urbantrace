"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";

type NavLinkProps = {
  href: string;
  /** Classes for the inactive and the active (current page) state. */
  idle: string;
  current: string;
  className?: string;
  label?: string;
  children: ReactNode;
};

function View({ href, idle, current, className = "", label, children, active }: NavLinkProps & { active: boolean }) {
  return (
    <Link href={href} aria-label={label} aria-current={active ? "page" : undefined} className={`${className} ${active ? current : idle}`}>
      {children}
    </Link>
  );
}

function Live(props: NavLinkProps) {
  return <View {...props} active={usePathname() === props.href} />;
}

/** A nav link that marks the current page. Only this leaf reads the pathname, inside Suspense, so the bar prerenders. */
export function NavLink(props: NavLinkProps) {
  return (
    <Suspense fallback={<View {...props} active={false} />}>
      <Live {...props} />
    </Suspense>
  );
}
