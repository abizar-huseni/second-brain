import { aiConfigured } from "@/lib/ai";
import { fileThoughts } from "@/lib/remember";
import { userDb } from "@/lib/serverDb";

export const maxDuration = 30;

// Called right after you dump a thought, so you see straight away how it was understood.
export async function POST(req: Request) {
  if (!aiConfigured()) return Response.json({ error: "not_configured" }, { status: 501 });
  const db = await userDb(req);
  if (!db) return Response.json({ error: "Sign in first" }, { status: 401 });
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });
  try {
    const [filed] = await fileThoughts(db, { ids: [id] });
    return Response.json({ filed: filed ?? null });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
