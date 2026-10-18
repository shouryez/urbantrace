"use client";

// Authority console controls: sign in, move a case along its journey, refresh the city's intelligence.
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";

export function AuthorityLogin() {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/authority", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passcode }) });
    if (!res.ok) {
      setError(((await res.json()) as { error?: string }).error ?? "Could not sign in");
      return;
    }
    router.refresh();
  };
  return (
    <form onSubmit={(e) => void submit(e)} className="flex max-w-md flex-col gap-3 rounded-card panel p-6">
      <label className="flex flex-col gap-2 text-sm font-bold">
        Ward office passcode
        <input
          type="password"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          className="rounded-[14px] border border-white/8 bg-ink-700 px-4 py-3 font-normal"
          autoComplete="current-password"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-ember">
          {error}
        </p>
      )}
      <div>
        <Button type="submit">Open the console</Button>
      </div>
    </form>
  );
}

const NEXT: Record<string, { stage: string; label: string } | null> = {
  reported: { stage: "assigned", label: "Assign zone officer" },
  routed: { stage: "assigned", label: "Assign zone officer" },
  triaged: { stage: "assigned", label: "Assign zone officer" },
  assigned: { stage: "field_team", label: "Schedule field team" },
  field_team: { stage: "site_visit", label: "Log site visit" },
  site_visit: { stage: "repair", label: "Start repair" },
  repair: null,
};

export function StageButton({ issueId, stage }: { issueId: number; stage: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = NEXT[stage] ?? null;
  if (!next) return <span className="text-xs text-fog-300">Awaiting fix photo</span>;
  const go = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/issues/${issueId}/stage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage: next.stage }) });
    setBusy(false);
    if (!res.ok) {
      setError(((await res.json()) as { error?: string }).error ?? "Failed");
      return;
    }
    router.refresh();
  };
  return (
    <span className="flex flex-col items-end gap-1">
      <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => void go()} disabled={busy}>
        {busy ? "Saving…" : next.label}
      </Button>
      {error && <span className="text-xs text-ember">{error}</span>}
    </span>
  );
}

export function RefreshButton() {
  const router = useRouter();
  const [state, setState] = useState<string | null>(null);
  const go = async () => {
    setState("Recomputing priorities, incidents and alerts…");
    const res = await fetch("/api/intel/refresh", { method: "POST" });
    const body = (await res.json()) as { issues?: number; incidents?: number; alerts?: number; error?: string };
    setState(res.ok ? `Done: ${body.issues} issues, ${body.incidents} incidents, ${body.alerts} new alerts.` : (body.error ?? "Refresh failed"));
    router.refresh();
  };
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="secondary" onClick={() => void go()}>
        Refresh city intelligence
      </Button>
      {state && (
        <span role="status" className="text-sm text-fog-300">
          {state}
        </span>
      )}
    </div>
  );
}

export function SignOut() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      onClick={async () => {
        await fetch("/api/authority", { method: "DELETE" });
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}
