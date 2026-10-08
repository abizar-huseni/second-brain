import { createClient } from "@supabase/supabase-js";
import { daysFromSamples, samplesFromPayload, TZ } from "@/lib/liveHealth";

// Receives pushes from the HC Webhook Android app.
// Header: x-sync-token: <your token from the Health page>
// Needs SUPABASE_SERVICE_ROLE_KEY in Vercel (server-only), because the phone has no login session.
export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return Response.json({ error: "Server missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  const db = createClient(url, service, { auth: { persistSession: false } });

  const token = req.headers.get("x-sync-token") ?? new URL(req.url).searchParams.get("token");
  if (!token) return Response.json({ error: "Missing x-sync-token" }, { status: 401 });
  const { data: owner } = await db.from("sync_tokens").select("user_id").eq("token", token).maybeSingle();
  if (!owner) return Response.json({ error: "Invalid token" }, { status: 401 });
  const user_id = owner.user_id as string;

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const samples = samplesFromPayload(payload);
  if (!samples.length) return Response.json({ ok: true, samples: 0 });

  const rows = samples.map((s) => ({ ...s, user_id }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("health_samples").upsert(rows.slice(i, i + 500), { onConflict: "user_id,type,start_time,end_time" });
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  // Recalculate every day touched by this push from all stored samples (payloads are incremental).
  const times = samples.flatMap((s) => [Date.parse(s.start_time), Date.parse(s.end_time)]);
  const from = new Date(Math.min(...times) - 36 * 3600 * 1000).toISOString();
  const to = new Date(Math.max(...times) + 36 * 3600 * 1000).toISOString();
  const { data: all, error } = await db
    .from("health_samples")
    .select("type,start_time,end_time,value,value_min")
    .eq("user_id", user_id)
    .gte("end_time", from)
    .lte("start_time", to);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const touched = new Set(samples.map((s) => new Date(s.type === "sleep" ? s.end_time : s.start_time).toLocaleDateString("en-CA", { timeZone: TZ })));
  const patches = daysFromSamples(all ?? []).filter((d) => touched.has(d.day));
  for (const p of patches) {
    const { error: e } = await db.from("health_days").upsert({ ...p, user_id, updated_at: new Date().toISOString() }, { onConflict: "user_id,day" });
    if (e) return Response.json({ error: e.message }, { status: 500 });
  }
  return Response.json({ ok: true, samples: samples.length, days: patches.map((p) => p.day) });
}
