import { signedIn } from "@/lib/serverDb";
import { serviceDb } from "@/lib/serviceDb";

// "Link a device": a signed-in device asks for a one-time sign-in code that another device opens
// (by scanning a QR code), so you never type your password on your phone.
// The code works once and expires within the hour (Supabase's email OTP expiry); the app hides it after 5 minutes.
export async function POST(req: Request) {
  const me = await signedIn(req);
  if (!me?.user.email) return Response.json({ error: "Sign in first" }, { status: 401 });
  const service = serviceDb();
  if (!service) return Response.json({ error: "Server missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });

  const { data, error } = await service.auth.admin.generateLink({ type: "magiclink", email: me.user.email });
  if (error || !data.properties?.hashed_token) return Response.json({ error: error?.message ?? "Could not make a code" }, { status: 500 });
  return Response.json({ code: data.properties.hashed_token, expires_at: Date.now() + 5 * 60 * 1000 });
}
