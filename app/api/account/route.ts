// GET /api/account: the signed in user, or {user: null}.
// POST /api/account {action: "signup" | "signin", name?, email, password, deviceId?}: create an account
// or sign in; this device's earlier reports are linked to the account. DELETE signs out.
import { z } from "zod";
import { AccountError, claimDeviceReports, clearSession, currentAccount, signIn, signUp } from "@/lib/account";

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("signup"),
    name: z.string().trim().min(1, "Enter your name").max(80),
    email: z.email("Enter a valid email").max(200),
    password: z.string().min(8, "Use at least 8 characters").max(200),
    deviceId: z.uuid().nullable().default(null),
  }),
  z.object({
    action: z.literal("signin"),
    email: z.email("Enter a valid email").max(200),
    password: z.string().min(1, "Enter your password").max(200),
    deviceId: z.uuid().nullable().default(null),
  }),
]);

export async function GET() {
  try {
    const user = await currentAccount();
    return Response.json({ user: user ? { name: user.name, email: user.email } : null });
  } catch {
    return Response.json({ user: null });
  }
}

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Check the form" }, { status: 400 });
  const b = parsed.data;
  try {
    const account = b.action === "signup" ? await signUp(b.name, b.email.toLowerCase(), b.password) : await signIn(b.email.toLowerCase(), b.password);
    const claimed = b.deviceId ? await claimDeviceReports(account.id, b.deviceId) : 0;
    return Response.json({ user: { name: account.name, email: account.email }, claimed });
  } catch (err) {
    if (err instanceof AccountError) return Response.json({ error: err.message }, { status: 401 });
    console.error("Account request failed:", err);
    return Response.json({ error: "Accounts are not available right now. Has migration 0008 been run?" }, { status: 502 });
  }
}

export async function DELETE() {
  await clearSession();
  return Response.json({ ok: true });
}
