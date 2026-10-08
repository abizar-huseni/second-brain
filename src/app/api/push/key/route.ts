import { vapidKeys } from "@/lib/push";
import { serviceDb } from "@/lib/serviceDb";

// The public half of the notification key, needed by the browser to subscribe.
export async function GET() {
  const db = serviceDb();
  if (!db) return Response.json({ error: "Server missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  try {
    return Response.json({ publicKey: (await vapidKeys(db)).publicKey });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
