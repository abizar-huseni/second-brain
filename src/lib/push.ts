// Server-only: phone notifications (Web Push, free). Keys are created once and kept in app_secrets,
// so there is nothing to set up in Vercel.
import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";

const SUBJECT = "https://github.com/abizar-huseni/second-brain";

export async function vapidKeys(db: SupabaseClient) {
  const { data } = await db.from("app_secrets").select("key, value").in("key", ["vapid_public", "vapid_private"]);
  const get = (k: string) => data?.find((r) => r.key === k)?.value;
  if (get("vapid_public") && get("vapid_private")) return { publicKey: get("vapid_public")!, privateKey: get("vapid_private")! };
  const keys = webpush.generateVAPIDKeys();
  const { error } = await db.from("app_secrets").insert([
    { key: "vapid_public", value: keys.publicKey },
    { key: "vapid_private", value: keys.privateKey },
  ]);
  if (error) throw new Error(error.message);
  return keys;
}

export async function sendPush(db: SupabaseClient, userId: string, msg: { title: string; body: string; url?: string }) {
  const { data: subs } = await db.from("push_subscriptions").select("endpoint, keys").eq("user_id", userId);
  if (!subs?.length) return 0;
  const { publicKey, privateKey } = await vapidKeys(db);
  webpush.setVapidDetails(SUBJECT, publicKey, privateKey);
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify({ ...msg, url: msg.url ?? "/" }), { TTL: 6 * 3600 });
      sent++;
    } catch (e) {
      // 404/410 = the phone unsubscribed or the browser was reset.
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
    }
  }
  return sent;
}
