// Server only: user accounts on Supabase Auth (email and password, with a display name). The session's
// access and refresh tokens live in httpOnly cookies; the browser never holds them. Accounts are
// optional: without one, reports still work and are remembered by the anonymous device id.
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/server";

const ACCESS = "ut_access";
const REFRESH = "ut_refresh";

export type Account = { id: string; email: string; name: string };

/** A short lived anon client for password sign in; it keeps no session of its own. */
function authClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env vars are not set; see .env.example");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function setSession(session: { access_token: string; refresh_token: string; expires_in: number }): Promise<void> {
  const jar = await cookies();
  const base = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };
  jar.set(ACCESS, session.access_token, { ...base, maxAge: session.expires_in });
  jar.set(REFRESH, session.refresh_token, { ...base, maxAge: 60 * 60 * 24 * 30 });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(ACCESS);
  jar.delete(REFRESH);
}

async function nameOf(id: string, fallback: string): Promise<string> {
  const { data } = await supabaseAdmin().from("profiles").select("name").eq("id", id).maybeSingle<{ name: string }>();
  return data?.name ?? fallback;
}

/**
 * Creates an account. The user is created already confirmed (no confirmation email for a prototype),
 * given a profile with their name, then signed in.
 */
export async function signUp(name: string, email: string, password: string): Promise<Account> {
  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
  if (error || !data.user) throw new AccountError(error?.message.includes("already") ? "An account with this email already exists. Sign in instead." : (error?.message ?? "Could not create the account"));
  const { error: pErr } = await admin.from("profiles").upsert({ id: data.user.id, name });
  if (pErr) console.error("Profile insert failed:", pErr.message);
  return signIn(email, password);
}

export async function signIn(email: string, password: string): Promise<Account> {
  const { data, error } = await authClient().auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) throw new AccountError("Wrong email or password");
  await setSession(data.session);
  return { id: data.user.id, email: data.user.email ?? email, name: await nameOf(data.user.id, (data.user.user_metadata?.name as string) ?? email.split("@")[0]!) };
}

/** The signed in user, refreshing an expired access token when the refresh token is still valid. */
export async function currentAccount(): Promise<Account | null> {
  const jar = await cookies();
  const access = jar.get(ACCESS)?.value;
  const refresh = jar.get(REFRESH)?.value;
  if (!access && !refresh) return null;
  const admin = supabaseAdmin();
  if (access) {
    const { data } = await admin.auth.getUser(access);
    if (data.user) return { id: data.user.id, email: data.user.email ?? "", name: await nameOf(data.user.id, (data.user.user_metadata?.name as string) ?? "") };
  }
  if (refresh) {
    const { data } = await authClient().auth.refreshSession({ refresh_token: refresh });
    if (data.session && data.user) {
      // Cookies can only be written in a route handler or server action; elsewhere the read still works.
      await setSession(data.session).catch(() => {});
      return { id: data.user.id, email: data.user.email ?? "", name: await nameOf(data.user.id, (data.user.user_metadata?.name as string) ?? "") };
    }
  }
  return null;
}

/** Links this device's earlier anonymous reports to the account, so "My reports" shows them. */
export async function claimDeviceReports(userId: string, deviceId: string): Promise<number> {
  const { data, error } = await supabaseAdmin().from("reports").update({ user_id: userId }).eq("device_id", deviceId).is("user_id", null).select("id");
  if (error) {
    console.error("Claiming device reports failed:", error.message);
    return 0;
  }
  return data?.length ?? 0;
}

export class AccountError extends Error {}

export type MyReport = {
  reportId: number;
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

/** Reports filed by this account or this device, newest first, with their issue's current state. */
export async function myReports(userId: string | null, deviceId: string | null): Promise<MyReport[]> {
  if (!userId && !deviceId) return [];
  const db = supabaseAdmin();
  let q = db.from("reports").select("id, issue_id, created_at").order("created_at", { ascending: false }).limit(200);
  q = userId && deviceId ? q.or(`user_id.eq.${userId},device_id.eq.${deviceId}`) : userId ? q.eq("user_id", userId) : q.eq("device_id", deviceId!);
  const { data: reports } = await q;
  const rows = (reports ?? []) as { id: number; issue_id: number; created_at: string }[];
  if (!rows.length) return [];
  const { data: issues } = await db
    .from("issues")
    .select("id, category, summary, status, stage, priority, backer_count, address")
    .in("id", [...new Set(rows.map((r) => r.issue_id))]);
  const byId = new Map(((issues ?? []) as Record<string, unknown>[]).map((i) => [i.id as number, i]));
  const seen = new Set<number>();
  const out: MyReport[] = [];
  for (const r of rows) {
    const i = byId.get(r.issue_id);
    if (!i || seen.has(r.issue_id)) continue;
    seen.add(r.issue_id);
    out.push({
      reportId: r.id,
      issueId: r.issue_id,
      category: i.category as string,
      summary: i.summary as string,
      status: i.status as string,
      stage: (i.stage as string) ?? null,
      priority: (i.priority as number) ?? null,
      backerCount: i.backer_count as number,
      address: (i.address as string) ?? null,
      reportedAt: r.created_at,
    });
  }
  return out;
}
