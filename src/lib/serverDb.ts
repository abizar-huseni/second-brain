// Server-only: a Supabase client that acts as the signed-in user, so Row Level Security still applies.
import { createClient } from "@supabase/supabase-js";

export async function userDb(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return null;
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!,
    { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } },
  );
  const { data } = await db.auth.getUser(token);
  return data.user ? db : null;
}
