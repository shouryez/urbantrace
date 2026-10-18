// Server only: the authority console's access check. A shared passcode (AUTHORITY_PASSCODE in
// .env.local) is enough for a prototype; it is kept in an httpOnly cookie as a SHA-256 hash.
import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const AUTHORITY_COOKIE = "ut_authority";

const hash = (s: string) => createHash("sha256").update(`urbantrace:${s}`).digest("hex");

/** The cookie value for the configured passcode, or null when no passcode is set. */
export function authorityToken(): string | null {
  const pass = process.env.AUTHORITY_PASSCODE;
  return pass ? hash(pass) : null;
}

export function checkPasscode(input: string): boolean {
  const pass = process.env.AUTHORITY_PASSCODE;
  if (!pass) return false;
  const a = Buffer.from(hash(input));
  const b = Buffer.from(hash(pass));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** True when this request carries the authority cookie. */
export async function isAuthority(): Promise<boolean> {
  const token = authorityToken();
  if (!token) return false;
  const value = (await cookies()).get(AUTHORITY_COOKIE)?.value;
  return value === token;
}
