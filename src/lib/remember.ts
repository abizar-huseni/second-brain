// Server-only: files dumped thoughts so the assistant can remember and use them.
import type { SupabaseClient } from "@supabase/supabase-js";
import { chat, parseJson } from "./ai";

export const KINDS = ["rule", "fact", "idea", "goal", "worry", "reminder", "other"] as const;

export type Filed = { id: string; kind: string; title: string; tags: string[]; remind_on: string | null; reply: string };

const SYSTEM = `You file quick thoughts for one person's second brain. They dump thoughts fast, often half-formed, so read generously.
UK English. Be brief.`;

const ASK = (today: string) => `Today is ${today}. For each thought decide:
- kind: "rule" (a standing preference or instruction for how you should help them, e.g. "always go for free options"),
  "fact" (something true about their life or situation), "idea", "goal", "worry", "reminder" (something to bring back on a date), or "other"
- title: max 8 words, in their voice
- tags: 1-3 lowercase single words
- remind_on: "YYYY-MM-DD" if they asked to be reminded or it's tied to a date, else null
- reply: one short sentence saying how you'll use it, e.g. "Noted: free options first, always."
Reply with only JSON: {"thoughts": [{"id": "...", "kind": "...", "title": "...", "tags": ["..."], "remind_on": null, "reply": "..."}]}`;

// Files the given notes (or the oldest unfiled ones) and saves the result.
export async function fileThoughts(db: SupabaseClient, opts: { ids?: string[]; userId?: string } = {}): Promise<Filed[]> {
  let q = db.from("notes").select("id, body, tags, created_at").eq("processed", false).order("created_at").limit(15);
  if (opts.ids) q = q.in("id", opts.ids);
  if (opts.userId) q = q.eq("user_id", opts.userId);
  const { data: notes } = await q;
  if (!notes?.length) return [];

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const list = notes.map((n) => `id ${n.id} (${String(n.created_at).slice(0, 10)}): ${String(n.body).slice(0, 800)}`).join("\n\n");
  const out = parseJson<{ thoughts?: Filed[] }>(await chat(SYSTEM, `${list}\n\n${ASK(today)}`));
  const filed: Filed[] = [];
  for (const t of out?.thoughts ?? []) {
    const note = notes.find((n) => n.id === t.id);
    if (!note) continue;
    const kind = (KINDS as readonly string[]).includes(t.kind) ? t.kind : "other";
    const tags = [...new Set([...(note.tags ?? []), ...(Array.isArray(t.tags) ? t.tags : []).map((x) => String(x).toLowerCase().replace(/[^\p{L}\p{N}_-]/gu, "")).filter(Boolean)])].slice(0, 6);
    const remind_on = typeof t.remind_on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.remind_on) ? t.remind_on : null;
    const title = String(t.title ?? "").slice(0, 100);
    await db.from("notes").update({ kind, title, tags, remind_on, processed: true }).eq("id", t.id);
    filed.push({ id: t.id, kind, title, tags, remind_on, reply: String(t.reply ?? "").slice(0, 200) });
  }
  return filed;
}
