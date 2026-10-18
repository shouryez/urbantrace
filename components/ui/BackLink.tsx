"use client";

// "Back" that returns to wherever you came from inside the app (the map, the queue, an incident),
// and falls back to a sensible page when the page was opened directly.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { MouseEvent } from "react";
import { buttonClasses } from "@/components/ui/Button";

export function BackLink({ fallback, label }: { fallback: string; label: string }) {
  const router = useRouter();
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    const internal = document.referrer.startsWith(window.location.origin) && window.history.length > 1;
    if (!internal) return; // follow the fallback link
    e.preventDefault();
    router.back();
  };
  return (
    <Link href={fallback} onClick={onClick} className={buttonClasses("ghost", "no-print self-start px-0")}>
      <ArrowLeft size={16} strokeWidth={1.75} aria-hidden /> {label}
    </Link>
  );
}
