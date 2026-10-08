import { DAY_TYPES, daysFromSamples, samplesFromPayload, TZ, type Sample } from "@/lib/liveHealth";
import { fromSyncToken, setStatus } from "@/lib/serviceDb";
import { saveBodyFromPayload, saveWorkoutsFromPayload } from "@/lib/body";

// Receives pushes from the HC Webhook Android app.
// Header: x-sync-token: <the watch key from the Me page>
// Needs SUPABASE_SERVICE_ROLE_KEY in Vercel (server-only), because the phone has no login session.
export async function POST(req: Request) {
  const auth = await fromSyncToken(req, "watch");
  if ("error" in auth) return auth.error;
  const { db, userId: user_id } = auth;

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }

  // Weigh-ins and body composition from the watch go to the Body page's physique card.
  let body = 0;
  try {
    body = await saveBodyFromPayload(db, user_id, payload);
  } catch (e) {
    console.error("body composition:", (e as Error).message);
  }
  // Workouts keep their type (run, strength, football...) in the training log.
  await saveWorkoutsFromPayload(db, user_id, payload).catch((e) => console.error("workouts:", (e as Error).message));

  const samples = samplesFromPayload(payload);
  if (!samples.length) {
    if (body) await setStatus(db, user_id, "watch", { ok: true, info: { samples: 0, body } });
    return Response.json({ ok: true, samples: 0, body });
  }
  if (samples.length > 20000) return Response.json({ error: "Too many samples in one push (max 20000)" }, { status: 413 });

  const rows = samples.map((s) => ({ ...s, user_id }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("health_samples").upsert(rows.slice(i, i + 500), { onConflict: "user_id,type,start_time,end_time" });
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  // Recalculate every day touched by this push from all stored samples (payloads are incremental).
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of samples) {
    lo = Math.min(lo, Date.parse(s.start_time), Date.parse(s.end_time));
    hi = Math.max(hi, Date.parse(s.start_time), Date.parse(s.end_time));
  }
  const from = new Date(lo - 36 * 3600 * 1000).toISOString();
  const to = new Date(hi + 36 * 3600 * 1000).toISOString();
  // PostgREST returns at most 1000 rows per request, so read in pages.
  const all: Sample[] = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await db
      .from("health_samples")
      .select("type,start_time,end_time,value,value_min")
      .eq("user_id", user_id)
      .in("type", DAY_TYPES)
      .gte("end_time", from)
      .lte("start_time", to)
      .order("start_time")
      .order("type")
      .order("end_time")
      .range(off, off + 999);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    all.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  const touched = new Set(samples.map((s) => new Date(s.type === "sleep" ? s.end_time : s.start_time).toLocaleDateString("en-CA", { timeZone: TZ })));
  const patches = daysFromSamples(all).filter((d) => touched.has(d.day));
  for (const p of patches) {
    const { error: e } = await db.from("health_days").upsert({ ...p, user_id, updated_at: new Date().toISOString() }, { onConflict: "user_id,day" });
    if (e) return Response.json({ error: e.message }, { status: 500 });
  }
  await setStatus(db, user_id, "watch", { ok: true, info: { samples: samples.length, body } });
  return Response.json({ ok: true, samples: samples.length, body, days: patches.map((p) => p.day) });
}
