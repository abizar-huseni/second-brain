import { isAction, validateAction } from "@/lib/agentActions";
import { fromSyncToken } from "@/lib/serviceDb";

const MIN = 60_000;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : null);

// Brain Link on the laptop calls this every ~15 seconds (outbound only; the laptop opens no ports).
// It reports what it can do and collects jobs you approved in the app.
export async function POST(req: Request) {
  const auth = await fromSyncToken(req);
  if ("error" in auth) return auth.error;
  const { db, userId } = auth;
  if (Number(req.headers.get("content-length") ?? 0) > 20_000) return Response.json({ error: "Too big" }, { status: 413 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const deviceId = str(body.device_id, 64);
  if (!deviceId || !/^[a-zA-Z0-9-]{8,64}$/.test(deviceId)) return Response.json({ error: "Bad device id" }, { status: 400 });
  const actions = (Array.isArray(body.actions) ? body.actions : []).filter(isAction).slice(0, 20);
  await db.from("agent_devices").upsert(
    { user_id: userId, device_id: deviceId, name: str(body.name, 60), os: str(body.os, 40), actions, info: safeInfo(body.info), last_seen: new Date().toISOString() },
    { onConflict: "user_id,device_id" },
  );

  // Approvals go stale after 30 minutes, so nothing runs long after you tapped it.
  const fresh = new Date(Date.now() - 30 * MIN).toISOString();
  await db.from("agent_jobs").update({ status: "expired" }).eq("user_id", userId).eq("status", "approved").lt("decided_at", fresh);

  const { data: approved } = await db
    .from("agent_jobs")
    .select("id, action, params, device_id")
    .eq("user_id", userId)
    .eq("status", "approved")
    .gte("decided_at", fresh)
    .order("created_at")
    .limit(3);

  const jobs = [];
  for (const j of approved ?? []) {
    if (j.device_id && j.device_id !== deviceId) continue;
    const v = validateAction(j.action, j.params);
    if (!v.ok || !actions.includes(v.action)) continue;
    // Claim it: only one poll can move it from approved to running.
    const { data: claimed } = await db.from("agent_jobs").update({ status: "running", device_id: deviceId }).eq("id", j.id).eq("status", "approved").select("id");
    if (claimed?.length) jobs.push({ id: j.id, action: v.action, params: v.params });
  }
  return Response.json({ jobs });
}

// Keep only small, known fields from the laptop's status report.
function safeInfo(raw: unknown) {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 10) / 10 : null);
  return {
    battery: num(r.battery),
    charging: typeof r.charging === "boolean" ? r.charging : null,
    disk_free_gb: num(r.disk_free_gb),
    uptime_h: num(r.uptime_h),
    platform: str(r.platform, 20),
    folders: (Array.isArray(r.folders) ? r.folders : []).map((f) => str(f, 60)).filter(Boolean).slice(0, 10),
  };
}
