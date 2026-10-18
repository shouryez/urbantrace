import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const PHOTO_BUCKET = "photos";

let admin: SupabaseClient | null = null;

/**
 * Supabase client with the service role key. It bypasses row level security, so it is used only
 * in server route handlers; the key has no NEXT_PUBLIC_ prefix and never reaches the browser.
 */
export function supabaseAdmin(): SupabaseClient {
  if (typeof window !== "undefined") throw new Error("supabaseAdmin is server only");
  if (!admin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Supabase env vars are not set; see .env.example");
    admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return admin;
}

export function photoPublicUrl(path: string): string {
  return supabaseAdmin().storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}
