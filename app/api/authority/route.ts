// POST /api/authority {passcode} signs in to the authority console; DELETE signs out.
import { cookies } from "next/headers";
import { AUTHORITY_COOKIE, authorityToken, checkPasscode } from "@/lib/authority";

export async function POST(request: Request) {
  const token = authorityToken();
  if (!token) return Response.json({ error: "Set AUTHORITY_PASSCODE in .env.local to enable the console" }, { status: 503 });
  const body = (await request.json().catch(() => null)) as { passcode?: unknown } | null;
  if (typeof body?.passcode !== "string" || !checkPasscode(body.passcode)) return Response.json({ error: "Wrong passcode" }, { status: 401 });
  (await cookies()).set(AUTHORITY_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return Response.json({ ok: true });
}

export async function DELETE() {
  (await cookies()).delete(AUTHORITY_COOKIE);
  return Response.json({ ok: true });
}
