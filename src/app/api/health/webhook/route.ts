import { daysFromSamples, samplesFromPayload, TZ } from "@/lib/liveHealth";
import { fromSyncToken, setStatus } from "@/lib/serviceDb";

// Receives pushes from the HC Webhook Android app.
// Header: x-sync-token: <your token from the Me page>
// Needs SUPABASE_SERVICE_ROLE_KEY in Vercel (server-only), because the phone has no login session.
export async function POST(req: Request) {
  const auth = await fromSyncToken(req);
  if ("error" in auth) return auth.error;
  const { db, userId: user_id } = auth;

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
  await setStatus(db, user_id, "watch", { ok: true, info: { samples: samples.length } });
  return Response.json({ ok: true, samples: samples.length, days: patches.map((p) => p.day) });
}
