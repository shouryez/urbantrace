import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Camera, IndianRupee, Map as MapIcon } from "lucide-react";
import { BackLink } from "@/components/ui/BackLink";
import { buttonClasses } from "@/components/ui/Button";
import { WardCard } from "@/components/ward/WardCard";
import { CATEGORY_LABELS } from "@/lib/ai/schemas";
import { getWard } from "@/lib/wards";

export const metadata: Metadata = { title: "Ward · UrbanTrace" };

const STATUS_TONE: Record<string, string> = { open: "text-ember", fix_claimed: "text-amber", verified: "text-mint" };

async function WardView({ params }: { params: PageProps<"/ward/[id]">["params"] }) {
  await connection();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const w = await getWard(id);
  if (!w) notFound();
  const density = w.population && w.areaKm2 ? Math.round(w.population / w.areaKm2) : null;
  const tiles: [string, string, string][] = [
    [w.population?.toLocaleString("en-IN") ?? "–", "people (2011 census)", ""],
    [w.areaKm2 !== null ? `${w.areaKm2} km²` : "–", "area", ""],
    [density?.toLocaleString("en-IN") ?? "–", "people per km²", ""],
    [String(w.open), "open issues", "text-ember"],
    [String(w.verified), "verified fixes", "text-mint"],
    [String(w.recurring), "recurring problems", "text-ember"],
    [String(w.accessibility), "accessibility hazards", "text-cyan"],
  ];

  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <p className="kicker text-fog-300">
          Ward <span className="num">{w.number}</span> · {w.corporation}
        </p>
        <h1 className="font-display text-[44px] leading-[1.02] font-bold tracking-tight md:text-[60px]">
          <span className="text-aurora">{w.name}</span>
        </h1>
        {w.nameKn && <p className="text-xl text-fog-200">{w.nameKn}</p>}
        <p className="text-sm text-fog-300">
          {w.zoneName ? `${w.zoneName} zone` : "Zone not known"} · revenue division {w.division ?? "–"}, sub-division {w.subdivision ?? "–"} · assembly constituency{" "}
          {w.assemblyNo ? `${w.assemblyNo} ${w.assembly}` : "–"}
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Link href="/report" className={buttonClasses("primary")}>
            <Camera size={16} aria-hidden /> Report a problem here
          </Link>
          <Link href="/map" className={buttonClasses("secondary")}>
            <MapIcon size={16} aria-hidden /> See it on the map
          </Link>
        </div>
      </header>

      <dl className="num grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {tiles.map(([v, l, t]) => (
          <div key={l} className="rounded-card panel p-4">
            <dd className={`text-2xl font-semibold ${t}`}>{v}</dd>
            <dt className="mt-1 font-sans text-xs text-fog-300">{l}</dt>
          </div>
        ))}
      </dl>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
        <div className="flex flex-col gap-6">
          <WardCard ward={w} />
          <section className="flex flex-col gap-3 rounded-card panel p-5">
            <h2 className="flex items-center gap-2 font-display text-[20px] font-semibold">
              <IndianRupee size={18} aria-hidden /> Funds
            </h2>
            <p className="text-sm">{w.office?.wardGrantNote ?? "A per ward allocation for 2026-27 has not been published in the sources we checked."}</p>
            {w.office?.budgetCrore != null && (
              <p className="text-sm text-fog-200">
                {w.corporation} budget 2026-27: <span className="num font-semibold">Rs {w.office.budgetCrore.toLocaleString("en-IN")} crore</span>
              </p>
            )}
            {w.office && w.office.sources.length > 1 && (
              <p className="text-[11px] text-fog-500">
                Sources:{" "}
                {w.office.sources.slice(1).map((s, i) => (
                  <a key={s} href={s} className="underline">
                    {i ? ", " : ""}
                    {new URL(s).hostname.replace("www.", "")}
                  </a>
                ))}
                . As reported; check the corporation&apos;s budget book for the final figures.
              </p>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-3 rounded-card panel p-5">
            <h2 className="font-display text-[20px] font-semibold">Open problems by kind</h2>
            {w.categories.length ? (
              <ul className="flex flex-col gap-2">
                {w.categories.map((c) => (
                  <li key={c.category} className="grid grid-cols-[150px_1fr_32px] items-center gap-3 text-sm">
                    <span>{CATEGORY_LABELS[c.category]}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-white/8">
                      <span className="block h-full origin-left rounded-full bg-ember" style={{ transform: `scaleX(${c.open / Math.max(...w.categories.map((x) => x.open))})` }} />
                    </span>
                    <span className="num text-right">{c.open}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-fog-300">No open problems reported in this ward yet.</p>
            )}
          </section>
          <section className="flex flex-col gap-3 rounded-card panel p-5">
            <h2 className="font-display text-[20px] font-semibold">Recent reports</h2>
            {w.recent.length ? (
              <ul className="flex flex-col divide-y divide-white/6">
                {w.recent.map((i) => (
                  <li key={i.id}>
                    <Link href={`/issue/${i.id}`} className="flex items-center gap-3 py-2.5 text-sm hover:opacity-80">
                      <span className="num text-xs text-fog-500">#{i.id}</span>
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-semibold">{CATEGORY_LABELS[i.category]}</span> · {i.summary}
                      </span>
                      <span className={`text-xs font-bold ${STATUS_TONE[i.status] ?? ""}`}>{i.status.replace("_", " ")}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-fog-300">Nothing reported here yet. Be the first.</p>
            )}
          </section>
        </div>
      </div>
      <p className="text-[11px] text-fog-500">
        Ward boundaries, zones, divisions and population: GBA ward delimitation 2025 via OpenCity (public domain). MLA: 16th Karnataka Legislative Assembly.
      </p>
    </article>
  );
}

export default function WardPage({ params }: PageProps<"/ward/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 md:px-6">
      <BackLink fallback="/wards" label="Back" />
      <Suspense fallback={<div className="skeleton h-96 rounded-card" />}>
        <WardView params={params} />
      </Suspense>
    </main>
  );
}
