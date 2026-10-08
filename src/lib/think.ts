// Server-only: the assistant thinking ahead on its own. Reads everything, optionally researches the web,
// and writes a few sharp "I noticed..." insights, each with a next step the user can accept in one tap.
import type { SupabaseClient } from "@supabase/supabase-js";
import { chat, parseJson } from "./ai";
import { buildContext } from "./coach";
import { researchConfigured, search, type Finding } from "./research";

export type InsightAction =
  | { type: "goal"; title: string; area?: string; target?: number; unit?: string; deadline?: string }
  | { type: "habit"; name: string; kind?: "good" | "bad" }
  | { type: "note"; body: string }
  | { type: "task"; title: string; day?: string; must?: boolean }
  | { type: "bill"; name: string; amount: number; next_due: string; every?: string };

export type Insight = {
  id?: string;
  kind: string;
  title: string;
  body: string;
  priority: number;
  sources?: { title: string; url: string }[] | null;
  action?: InsightAction | null;
  status?: string;
  created_at?: string;
};

const SYSTEM = `You are the proactive brain inside one person's life dashboard.
Your job is to think ahead for them without being asked. Look for what they haven't noticed yet:
deadlines and legal limits (visa, tax, university), costs they must save for, money leaks, debt maths,
sleep/mood/energy patterns, habits slipping, goals going stale, and real opportunities that fit their rules.
Work out the actual numbers and dates. Be specific, direct and useful. UK English, £. No fluff, no emojis.
Never suggest anything that breaks the rules in "About the user".`;

const PLAN = `Before writing insights you may search the web to check rules, costs or deadlines that matter to this person right now.
Reply with only JSON: {"queries": ["...", "..."]} with 0 to 3 precise search queries (include "UK" and the year where relevant).`;

const WRITE = `Write 1 to 4 NEW insights. Each one must be something the person would thank you for spotting.
Rules:
- Base each on their data or the research. Use numbers and dates. If it relies on general knowledge that may have changed, end the body with "Check this."
- Don't repeat anything in "Past insights" unless something important changed.
- priority 1 = act today, 2 = this week, 3 = worth knowing.
- Offer an action when one obviously helps, otherwise null. Types:
  {"type": "goal", "title", "area", "target", "unit", "deadline": "YYYY-MM-DD"}
  {"type": "task", "title", "day": "YYYY-MM-DD", "must": true}
  {"type": "bill", "name", "amount", "next_due": "YYYY-MM-DD", "every": "week|month|year|once"}  (an upcoming expense to track)
  {"type": "habit", "name", "kind": "good|bad"}
  {"type": "note", "body"}
- For health points, cite the trusted guidance inline like [nhs:sleep-hours].
- Cite research by its [number] in "sources".
Reply with only JSON:
{"insights": [{"kind": "deadline|money|health|growth|risk|opportunity", "title": "max 8 words", "body": "1-3 sentences", "priority": 1,
  "sources": [1], "action": {"type": "goal", "title": "...", "area": "growth|fitness|mind|money|work", "target": 3007, "unit": "£", "deadline": "2026-12-31"} }]}`;

// userId is required with the service client (heartbeat); with a user client RLS filters.
export async function think(db: SupabaseClient, userId?: string): Promise<Insight[]> {
  const context = await buildContext(db, userId);
  let pastQ = db.from("insights").select("title, status, created_at").order("created_at", { ascending: false }).limit(30);
  if (userId) pastQ = pastQ.eq("user_id", userId);
  const { data: past } = await pastQ;
  const pastText = (past ?? []).length
    ? (past ?? []).map((p) => `- ${p.title} (${p.status}, ${String(p.created_at).slice(0, 10)})`).join("\n")
    : "None yet.";

  // Step 1: decide what to look up, then look it up.
  let findings: Finding[] = [];
  if (researchConfigured()) {
    const plan = parseJson<{ queries?: string[] }>(await chat(SYSTEM, `${context}\n\n## Past insights\n${pastText}\n\n${PLAN}`));
    const queries = (plan?.queries ?? []).filter((q) => typeof q === "string" && q.trim()).slice(0, 3);
    findings = (await Promise.all(queries.map((q) => search(q).catch(() => [])))).flat().slice(0, 10);
  }
  const research = findings.length
    ? `\n\n## Research (from the web, today)\n${findings.map((f, i) => `[${i + 1}] ${f.title} (${f.url})\n${f.content}`).join("\n\n")}`
    : "";

  // Step 2: think and write.
  const out = parseJson<{ insights?: (Insight & { sources?: unknown })[] }>(
    await chat(SYSTEM, `${context}\n\n## Past insights\n${pastText}${research}\n\n${WRITE}`),
  );
  const rows = (out?.insights ?? [])
    .filter((i) => i?.title && i?.body)
    .slice(0, 4)
    .map((i) => ({
      ...(userId ? { user_id: userId } : {}),
      kind: String(i.kind || "growth").slice(0, 20),
      title: String(i.title).slice(0, 120),
      body: String(i.body).slice(0, 600),
      priority: [1, 2, 3].includes(Number(i.priority)) ? Number(i.priority) : 2,
      sources: Array.isArray(i.sources)
        ? (i.sources as unknown[]).map((n) => findings[Number(n) - 1]).filter(Boolean).map((f) => ({ title: f.title, url: f.url }))
        : null,
      action: validAction(i.action),
    }));
  if (rows.length) {
    const { error } = await db.from("insights").insert(rows);
    if (error) throw new Error(error.message);
  }
  return rows;
}

function validAction(a: unknown): InsightAction | null {
  if (!a || typeof a !== "object") return null;
  const x = a as Record<string, unknown>;
  if (x.type === "goal" && typeof x.title === "string") {
    return {
      type: "goal",
      title: x.title.slice(0, 120),
      area: ["growth", "fitness", "mind", "money", "work"].includes(String(x.area)) ? String(x.area) : "growth",
      target: Number(x.target) > 0 ? Number(x.target) : 100,
      unit: typeof x.unit === "string" ? x.unit.slice(0, 10) : "%",
      deadline: typeof x.deadline === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x.deadline) ? x.deadline : undefined,
    };
  }
  const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  if (x.type === "task" && typeof x.title === "string") return { type: "task", title: x.title.slice(0, 160), day: date(x.day), must: Boolean(x.must) };
  if (x.type === "bill" && typeof x.name === "string" && Number(x.amount) > 0 && date(x.next_due)) {
    return { type: "bill", name: x.name.slice(0, 80), amount: Number(x.amount), next_due: date(x.next_due)!, every: ["week", "month", "year", "once"].includes(String(x.every)) ? String(x.every) : "once" };
  }
  if (x.type === "habit" && typeof x.name === "string") return { type: "habit", name: x.name.slice(0, 80), kind: x.kind === "bad" ? "bad" : "good" };
  if (x.type === "note" && typeof x.body === "string") return { type: "note", body: x.body.slice(0, 1000) };
  return null;
}
