import { aiConfigured } from "@/lib/ai";
import { makeFuel } from "@/lib/fuel";
import { lday } from "@/lib/ldates";
import { userDb } from "@/lib/serverDb";

export const maxDuration = 60;

// "Fuel me" / "Another one" on Today. The heartbeat makes one every morning on its own.
export async function POST(req: Request) {
  if (!aiConfigured()) return Response.json({ error: "not_configured" }, { status: 501 });
  const db = await userDb(req);
  if (!db) return Response.json({ error: "Sign in first" }, { status: 401 });
  const day = lday();
  const { data: last } = await db.from("plans").select("created_at").eq("kind", "fuel").eq("period", day).maybeSingle();
  if (last && Date.now() - Date.parse(last.created_at) < 2 * 60 * 1000) return Response.json({ error: "Fresh one just landed. Give it a couple of minutes." }, { status: 429 });
  try {
    return Response.json({ fuel: await makeFuel(db, day) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
