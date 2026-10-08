import { aiConfigured } from "@/lib/ai";
import { userDb } from "@/lib/serverDb";
import { think } from "@/lib/think";

export const maxDuration = 60;

// "Think now" button. The heartbeat also runs this every morning on its own.
export async function POST(req: Request) {
  if (!aiConfigured()) return Response.json({ error: "not_configured" }, { status: 501 });
  const db = await userDb(req);
  if (!db) return Response.json({ error: "Sign in first" }, { status: 401 });

  // Once every 20 minutes is plenty and protects the free AI quota.
  const { data: last } = await db.from("insights").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (last && Date.now() - Date.parse(last.created_at) < 20 * 60 * 1000) {
    return Response.json({ error: "Already thought about this. Give it 20 minutes." }, { status: 429 });
  }
  try {
    return Response.json({ insights: await think(db) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
