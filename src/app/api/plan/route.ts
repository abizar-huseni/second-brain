import { aiConfigured } from "@/lib/ai";
import { makePlan, type PlanKind } from "@/lib/plan";
import { userDb } from "@/lib/serverDb";

export const maxDuration = 60;

const PERIOD: Record<PlanKind, RegExp> = { day: /^\d{4}-\d{2}-\d{2}$/, week: /^\d{4}-\d{2}-\d{2}$/, money: /^\d{4}-\d{2}-\d{2}$/, year: /^\d{4}-\d{2}$/ };

// "Rethink" button on the Plan page. The heartbeat makes these on its own too.
export async function POST(req: Request) {
  if (!aiConfigured()) return Response.json({ error: "not_configured" }, { status: 501 });
  const db = await userDb(req);
  if (!db) return Response.json({ error: "Sign in first" }, { status: 401 });
  const { kind, period } = (await req.json().catch(() => ({}))) as { kind?: PlanKind; period?: string };
  if (!kind || !(kind in PERIOD) || !period || !PERIOD[kind].test(period)) return Response.json({ error: "Bad plan request" }, { status: 400 });

  const { data: last } = await db.from("plans").select("created_at").eq("kind", kind).eq("period", period).maybeSingle();
  if (last && Date.now() - Date.parse(last.created_at) < 5 * 60 * 1000) return Response.json({ error: "Just planned this. Give it 5 minutes." }, { status: 429 });
  try {
    return Response.json({ content: await makePlan(db, kind, period) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
