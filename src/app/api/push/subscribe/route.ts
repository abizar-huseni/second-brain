import { sendPush } from "@/lib/push";
import { signedIn } from "@/lib/serverDb";
import { serviceDb } from "@/lib/serviceDb";

// Saves this phone/browser for notifications and sends a test one.
export async function POST(req: Request) {
  const me = await signedIn(req);
  if (!me) return Response.json({ error: "Sign in first" }, { status: 401 });
  const { subscription } = (await req.json().catch(() => ({}))) as { subscription?: { endpoint: string; keys: Record<string, string> } };
  if (!subscription?.endpoint?.startsWith("https://") || !subscription.keys) return Response.json({ error: "Missing subscription" }, { status: 400 });

  const { error } = await me.db.from("push_subscriptions").upsert({ endpoint: subscription.endpoint, keys: subscription.keys }, { onConflict: "endpoint" });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const service = serviceDb();
  if (service) await sendPush(service, me.user.id, { title: "🔔 Notifications are on", body: "You'll hear from me when your brief or plan is ready, or I notice something.", url: "/" });
  return Response.json({ ok: true });
}
