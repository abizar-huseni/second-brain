import { lastServedBy, providers } from "@/lib/ai";
import { researchConfigured } from "@/lib/research";
import { userDb } from "@/lib/serverDb";

// Which free AI brains are switched on (names only, never keys), for the Me page.
export async function POST(req: Request) {
  const db = await userDb(req);
  if (!db) return Response.json({ error: "Sign in first" }, { status: 401 });
  const { data } = await db.from("sync_status").select("last_ok, last_error").eq("source", "ai").maybeSingle();
  return Response.json({
    providers: providers().map((p) => ({ name: p.name, models: p.models.length })),
    research: researchConfigured(),
    lastServedBy,
    lastOk: data?.last_ok ?? null,
    lastError: data?.last_error ?? null,
  });
}
