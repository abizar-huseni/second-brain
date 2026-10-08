import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
// The Vercel + Supabase integration may name the key either way.
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export const isConfigured = Boolean(url && key);

// Placeholder values keep the build working before .env.local exists.
// Sessions live on the device and refresh themselves, so you only sign in once per device.
export const supabase = createClient(url || "http://localhost", key || "missing", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
