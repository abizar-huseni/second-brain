import { aiConfigured, chat } from "@/lib/ai";
import { buildContext, makeBrief, SYSTEM } from "@/lib/coach";
import { userDb } from "@/lib/serverDb";

export const maxDuration = 60;

// POST {mode: "brief"} → today's plan. POST {mode: "ask", question} → a direct answer using your data.
export async function POST(req: Request) {
  if (!aiConfigured()) return Response.json({ error: "not_configured" }, { status: 501 });
  const db = await userDb(req);
  if (!db) return Response.json({ error: "Sign in first" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { mode?: string; question?: string };
  try {
    if (body.mode === "ask") {
      const q = (body.question ?? "").trim().slice(0, 500);
      if (!q) return Response.json({ error: "Ask something" }, { status: 400 });
      const context = await buildContext(db);
      const answer = await chat(SYSTEM, `${context}\n\nQuestion: ${q}\nAnswer in at most 5 short sentences or bullets. Plain text, no markdown headings.`);
      return Response.json({ answer: answer.trim() });
    }
    return Response.json({ brief: await makeBrief(db) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
