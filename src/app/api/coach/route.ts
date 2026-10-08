import { aiConfigured, chat, parseJson } from "@/lib/ai";
import { BRIEF_FORMAT, buildContext, SYSTEM, type Brief } from "@/lib/coach";
import { userDb } from "@/lib/serverDb";

export const maxDuration = 60;

// POST {mode: "brief"} → today's plan. POST {mode: "ask", question} → a direct answer using your data.
export async function POST(req: Request) {
  if (!aiConfigured()) return Response.json({ error: "not_configured" }, { status: 501 });
  const db = await userDb(req);
  if (!db) return Response.json({ error: "Sign in first" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { mode?: string; question?: string };
  try {
    const context = await buildContext(db);
    if (body.mode === "ask") {
      const q = (body.question ?? "").trim().slice(0, 500);
      if (!q) return Response.json({ error: "Ask something" }, { status: 400 });
      const answer = await chat(SYSTEM, `${context}\n\nQuestion: ${q}\nAnswer in at most 5 short sentences or bullets. Plain text, no markdown headings.`);
      return Response.json({ answer: answer.trim() });
    }
    const raw = await chat(SYSTEM, `${context}\n\n${BRIEF_FORMAT}`);
    const brief = parseJson<Brief>(raw);
    if (!brief?.headline || !Array.isArray(brief.focus)) return Response.json({ error: "The AI gave an unreadable answer. Try again." }, { status: 502 });
    return Response.json({ brief: { ...brief, focus: brief.focus.slice(0, 3) } });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
