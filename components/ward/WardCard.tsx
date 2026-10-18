// Who answers for a ward: the zone's officers as published by the corporation, the area's MLA,
// and the corporation's helpline. Used on the case page and the ward page.
import Link from "next/link";
import { Building2, Landmark, Mail, Phone, UserRound } from "lucide-react";
import type { WardProfile } from "@/lib/wards";

export function WardCard({ ward, compact = false }: { ward: WardProfile; compact?: boolean }) {
  const zoneOfficers = ward.officers.filter((o) => o.zone === ward.zone);
  const corporationOfficers = ward.officers.filter((o) => o.zone === null);
  const shown = compact ? [...zoneOfficers, ...corporationOfficers.filter((o) => o.role === "Commissioner")] : [...zoneOfficers, ...corporationOfficers];
  return (
    <section className="flex flex-col gap-4 rounded-card panel p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="kicker flex items-center gap-1.5 text-fog-300">
            <Building2 size={13} aria-hidden /> Your ward
          </p>
          <p className="mt-1 font-display text-[22px] leading-tight font-semibold">
            {ward.name} {ward.nameKn && <span className="text-base font-normal text-fog-300">{ward.nameKn}</span>}
          </p>
          <p className="text-xs text-fog-300">
            Ward <span className="num">{ward.number ?? "–"}</span> · {ward.zoneName ? `${ward.zoneName} zone` : "zone not known"} · {ward.corporation}
          </p>
        </div>
        {compact && (
          <Link href={`/ward/${ward.id}`} className="shrink-0 rounded-full border border-white/12 px-3 py-1.5 text-xs font-bold hover:bg-white/6">
            Ward profile
          </Link>
        )}
      </div>

      <ul className="flex flex-col gap-2.5">
        {shown.map((o) => (
          <li key={`${o.role}-${o.name}-${o.zone}`} className="flex items-start gap-3">
            <span aria-hidden className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-white/6">
              <UserRound size={15} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{o.name}</span>
              <span className="block text-xs text-fog-300">
                {o.role}
                {o.zone ? `, ${ward.zoneName ?? o.zone} zone` : `, ${ward.corporation}`}
              </span>
              {o.email && (
                <a href={`mailto:${o.email}`} className="mt-0.5 flex items-center gap-1 font-mono text-[11px] break-all text-signal underline-offset-4 hover:underline">
                  <Mail size={11} aria-hidden /> {o.email}
                </a>
              )}
            </span>
          </li>
        ))}
      </ul>

      {ward.mla && (
        <p className="flex items-start gap-2 text-sm">
          <Landmark size={15} className="mt-0.5 shrink-0 text-violet" aria-hidden />
          <span>
            MLA for {ward.assembly}: <span className="font-semibold">{ward.mla.name}</span>
            {ward.mla.party ? ` (${ward.mla.party})` : ""}
          </span>
        </p>
      )}
      {ward.office && (
        <p className="flex items-start gap-2 text-sm">
          <Phone size={15} className="mt-0.5 shrink-0 text-cyan" aria-hidden />
          <span>
            Helpline <span className="num">{ward.office.helpline ?? "1533"}</span>
            {ward.office.phones.length > 0 && <span className="text-fog-300"> · {ward.office.phones.join(" · ")}</span>}
          </span>
        </p>
      )}
      <p className="text-[11px] text-fog-500">
        Ward councillor seats are vacant until the corporation elections; officers as listed on {ward.office?.website ? <a className="underline" href={ward.office.website}>the corporation&apos;s website</a> : "the corporation's website"}
        {ward.office?.asOf ? ` on ${ward.office.asOf}` : ""}.
      </p>
    </section>
  );
}
