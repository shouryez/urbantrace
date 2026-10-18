"use client";

// "Me": sign in or create an account (name, email, password), then every report from this account
// and this phone with where it stands now, and the civic impact. Accounts are optional.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, UserRound } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ImpactView } from "@/components/impact/ImpactView";
import { Button, buttonClasses } from "@/components/ui/Button";
import { CATEGORY_LABELS, type Category } from "@/lib/ai/schemas";
import { getDeviceId } from "@/lib/device";

type User = { name: string; email: string } | null;
type MyReport = {
  issueId: number;
  category: string;
  summary: string;
  status: string;
  stage: string | null;
  priority: number | null;
  backerCount: number;
  address: string | null;
  reportedAt: string;
};

const STATUS: Record<string, { label: string; tone: string }> = {
  open: { label: "Open", tone: "bg-ember text-ink-950" },
  fix_claimed: { label: "Fix claimed", tone: "bg-amber text-ink-950" },
  verified: { label: "Verified fixed", tone: "bg-mint text-ink-950" },
};

const STAGE_LABEL: Record<string, string> = {
  reported: "Reported",
  routed: "With the department",
  triaged: "AI triaged",
  assigned: "Zone officer assigned",
  field_team: "Field team scheduled",
  site_visit: "Site visited",
  repair: "Repair in progress",
  verified: "Verified",
};

export function MeView() {
  const router = useRouter();
  const [user, setUser] = useState<User | undefined>(undefined);
  const [reports, setReports] = useState<MyReport[] | null>(null);

  const load = useCallback(async () => {
    const [a, r] = await Promise.all([
      fetch("/api/account").then((x) => x.json() as Promise<{ user: User }>).catch(() => ({ user: null })),
      fetch(`/api/account/reports?device=${getDeviceId()}`).then((x) => (x.ok ? (x.json() as Promise<{ reports: MyReport[] }>) : { reports: [] })).catch(() => ({ reports: [] })),
    ]);
    setUser(a.user);
    setReports(r.reports);
  }, []);
  useEffect(() => {
    // fetching on mount; the state updates arrive asynchronously
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const signOut = async () => {
    await fetch("/api/account", { method: "DELETE" });
    await load();
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-8">
      {user === undefined ? (
        <div className="skeleton h-40 rounded-card" />
      ) : user ? (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-card panel p-5">
          <div className="flex items-center gap-4">
            <span aria-hidden className="flex size-14 items-center justify-center rounded-full bg-[conic-gradient(from_200deg,#a78bfa,#38d3f5,#a78bfa)] font-display text-2xl font-extrabold text-ink-950">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <p className="font-display text-2xl font-semibold">Hi, {user.name}</p>
              <p className="text-sm text-fog-300">{user.email}</p>
            </div>
          </div>
          <Button variant="ghost" onClick={() => void signOut()}>
            <LogOut size={16} aria-hidden /> Sign out
          </Button>
        </section>
      ) : (
        <AuthForm
          onDone={async () => {
            await load();
            router.refresh();
          }}
        />
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-[24px] font-semibold">My reports</h2>
          <Link href="/report" className="text-sm font-bold text-signal underline-offset-4 hover:underline">
            Report another
          </Link>
        </div>
        {reports === null ? (
          <div className="skeleton h-32 rounded-card" />
        ) : reports.length ? (
          <ul className="flex flex-col gap-2">
            {reports.map((r) => {
              const s = STATUS[r.status] ?? { label: r.status, tone: "bg-white/10" };
              return (
                <li key={r.issueId}>
                  <Link href={`/issue/${r.issueId}`} className="flex items-center gap-4 rounded-card panel p-4 transition-transform hover:-translate-y-0.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">
                        {CATEGORY_LABELS[r.category as Category] ?? r.category} · <span className="font-normal text-fog-200">{r.summary}</span>
                      </p>
                      <p className="truncate text-xs text-fog-300">
                        #{r.issueId} · {r.address ?? "no address"} · reported {new Date(r.reportedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} ·{" "}
                        {r.backerCount} {r.backerCount === 1 ? "report" : "reports"}
                      </p>
                      <p className="mt-1 text-xs font-bold text-fog-100">{STAGE_LABEL[r.stage ?? "reported"] ?? r.stage}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-extrabold ${s.tone}`}>{s.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex flex-col items-start gap-3 rounded-card panel p-5">
            <p className="text-fog-200">Nothing reported from this account or this phone yet.</p>
            <Link href="/report" className={buttonClasses("primary")}>
              Report your first issue
            </Link>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-[24px] font-semibold">My civic impact</h2>
        <ImpactView />
      </section>
    </div>
  );
}

function AuthForm({ onDone }: { onDone: () => Promise<void> }) {
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: mode, name, email, password, deviceId: getDeviceId() }),
    }).catch(() => null);
    setBusy(false);
    if (!res) return setError("Network error. Try again.");
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return setError(body.error ?? "Could not sign in");
    await onDone();
  };

  const field = "rounded-[14px] border border-white/8 bg-ink-700 px-4 py-3 font-normal";
  return (
    <section className="grid gap-6 rounded-card panel p-5 md:grid-cols-[1fr_1.2fr] md:p-7">
      <div className="flex flex-col gap-3">
        <span aria-hidden className="flex size-12 items-center justify-center rounded-2xl bg-white/6">
          <UserRound size={22} />
        </span>
        <p className="font-display text-2xl font-semibold">{mode === "signup" ? "Create your account" : "Welcome back"}</p>
        <p className="text-sm text-fog-300">
          Optional. With an account your reports follow you across phones, and you can track every complaint in one place. Reports from this phone are added to it.
        </p>
      </div>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-1 rounded-full bg-ink-800 p-1" role="tablist" aria-label="Account">
          {(["signup", "signin"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => (setMode(m), setError(null))}
              className={`rounded-full py-2 text-sm font-bold ${mode === m ? "bg-signal text-ink-950" : "text-fog-300"}`}
            >
              {m === "signup" ? "Create account" : "Sign in"}
            </button>
          ))}
        </div>
        {mode === "signup" && (
          <label className="flex flex-col gap-1.5 text-sm font-bold">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required className={field} />
          </label>
        )}
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required className={field} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            minLength={mode === "signup" ? 8 : 1}
            required
            className={field}
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-ember">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
        </Button>
      </form>
    </section>
  );
}
