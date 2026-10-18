import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browser: SupabaseClient | null = null;

/** Supabase client with the anon key, for the browser: read only (RLS), used for Realtime. */
export function supabaseBrowser(): SupabaseClient {
  if (!browser) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set");
    browser = createClient(url, key, { auth: { persistSession: false } });
  }
  return browser;
}
