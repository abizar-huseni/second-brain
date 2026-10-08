import { createHash } from "node:crypto";
import { sendPush } from "@/lib/push";
import { serviceDb } from "@/lib/serviceDb";

// The device agent calls this after it suggests something, so your phone buzzes with it.
// Header: x-device-token (the agent's own token). Sends one notification for everything new.
export async function POST(req: Request) {
  const db = serviceDb();
  if (!db) return Response.json({ error: "Server missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  const token = req.headers.get("x-device-token");
  if (!token) return Response.json({ error: "Missing x-device-token" }, { status: 401 });
  const hash = createHash("sha256").update(token).digest("hex");
  const { data: device } = await db.from("devices").select("id, user_id, name").eq("token_hash", hash).eq("revoked", false).maybeSingle();
  if (!device) return Response.json({ error: "Invalid token" }, { status: 401 });

  const { data: fresh } = await db.from("device_actions").select("id, title").eq("device_id", device.id).eq("status", "proposed").eq("notified", false).order("created_at");
  if (!fresh?.length) return Response.json({ sent: 0 });
  await db.from("device_actions").update({ notified: true }).in("id", fresh.map((a) => a.id));
  const sent = await sendPush(db, device.user_id, {
    title: fresh.length === 1 ? `${device.name}: ${fresh[0].title}` : `${device.name} has ${fresh.length} suggestions`,
    body: fresh.length === 1 ? "Tap to approve or say no." : fresh.map((a) => a.title).join(" · ").slice(0, 160),
    url: "/#devices",
  });
  return Response.json({ sent });
}
