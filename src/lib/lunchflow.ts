// Server-only: talks to Lunch Flow, which connects UK banks (Lloyds, HSBC, ...) through open banking.
// Needs one Vercel env var: LUNCHFLOW_API_KEY (Lunch Flow → Destinations → REST API).
import { createClient } from "@supabase/supabase-js";

const API = "https://www.lunchflow.app/api/v1";

export async function lf<T>(path: string): Promise<T> {
  const key = process.env.LUNCHFLOW_API_KEY;
  if (!key) throw new Error("Bank sync isn't set up yet: add LUNCHFLOW_API_KEY in Vercel, then redeploy.");
  const res = await fetch(API + path, { headers: { "x-api-key": key }, cache: "no-store" });
  const text = await res.text();
  if (!res.ok) throw new Error(`Lunch Flow ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text) as T;
}

// Only signed-in users of this app may trigger a sync.
export async function requireUser(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return null;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!,
  );
  const { data } = await supabase.auth.getUser(token);
  return data.user;
}
