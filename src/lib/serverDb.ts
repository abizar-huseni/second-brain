// Server-only: a Supabase client that acts as the signed-in user, so Row Level Security still applies.
// Only the owner (the first account) gets one: this app is for one person, and its server keys
// (bank, AI, notifications) must never work for anyone else who manages to sign up.
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { ownerId } from "./serviceDb";

export async function signedIn(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return null;
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!,
    { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } },
  );
  const { data } = await db.auth.getUser(token);
  if (!data.user || !(await isOwner(db, data.user))) return null;
  return { db, user: data.user };
}

export async function userDb(req: Request) {
  return (await signedIn(req))?.db ?? null;
}

async function isOwner(db: SupabaseClient, user: User) {
  const { data, error } = await db.rpc("is_owner");
  if (!error) return data === true;
  // Before supabase/007_lockdown.sql is applied, ask the admin API instead.
  return user.id === (await ownerId());
}
