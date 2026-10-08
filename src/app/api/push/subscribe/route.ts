import { sendPush } from "@/lib/push";
import { userDb } from "@/lib/serverDb";
import { serviceDb } from "@/lib/serviceDb";

// Saves this phone/browser for notifications and sends a test one.
export async function POST(req: Request) {
  const db = await userDb(req);
  if (!db) return Response.json({ error: "Sign in first" }, { status: 401 });
  const { subscription } = (await req.json()) as { subscription?: { endpoint: string; keys: Record<string, string> } };
  if (!subscription?.endpoint || !subscription.keys) return Response.json({ error: "Missing subscription" }, { status: 400 });

  const { error } = await db.from("push_subscriptions").upsert({ endpoint: subscription.endpoint, keys: subscription.keys }, { onConflict: "endpoint" });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const { data } = await db.auth.getUser(req.headers.get("authorization")!.replace(/^Bearer /, ""));
  const service = serviceDb();
  if (service && data.user) await sendPush(service, data.user.id, { title: "🔔 Notifications are on", body: "You'll hear from me when your brief or plan is ready, or I notice something.", url: "/" });
  return Response.json({ ok: true });
}
