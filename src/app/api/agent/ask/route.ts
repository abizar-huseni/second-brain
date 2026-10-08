import { ACTIONS, validateAction } from "@/lib/agentActions";
import { aiConfigured, chat, parseJson } from "@/lib/ai";
import { userDb } from "@/lib/serverDb";

export const maxDuration = 60;

const SYSTEM = `You turn a person's plain request about their laptop into ONE action from a fixed list, or no action.
You can only use the actions listed. If none fits, reply with no action and one short, helpful sentence (UK English).
Never invent actions or parameters. Prefer the least invasive option; for tidying always use dry_run true first.`;

// "Ask your laptop…": the assistant suggests one action; nothing runs until you tap Approve.
export async function POST(req: Request) {
  if (!aiConfigured()) return Response.json({ error: "not_configured" }, { status: 501 });
  const db = await userDb(req);
  if (!db) return Response.json({ error: "Sign in first" }, { status: 401 });
  const { text } = (await req.json().catch(() => ({}))) as { text?: string };
  const ask = typeof text === "string" ? text.trim().slice(0, 400) : "";
  if (!ask) return Response.json({ error: "Say what you need" }, { status: 400 });

  const { data: devices } = await db.from("agent_devices").select("device_id, name, os, actions, info, last_seen").order("last_seen", { ascending: false }).limit(3);
  const device = devices?.[0];
  const can = new Set<string>((device?.actions as string[] | null) ?? Object.keys(ACTIONS));
  const folders = ((device?.info as { folders?: string[] } | null)?.folders ?? []).join(", ") || "unknown";
  const list = Object.entries(ACTIONS)
    .filter(([id]) => can.has(id))
    .map(([id, a]) => `- ${id}: ${a.hint}`)
    .join("\n");

  const raw = await chat(
    SYSTEM,
    `Laptop: ${device ? `${device.name ?? "laptop"} (${device.os ?? "?"})` : "not connected yet"}. Shared folders: ${folders}.
Actions:
${list}

Request: """${ask}"""

Reply with only JSON: {"action": "id or null", "params": {}, "reason": "one short sentence on what this fixes", "reply": "if no action: one helpful sentence"}`,
    { temperature: 0.2, budgetMs: 40_000 },
  ).catch((e: Error) => e);
  if (raw instanceof Error) return Response.json({ error: raw.message }, { status: 502 });

  const out = parseJson<{ action?: string | null; params?: unknown; reason?: string; reply?: string }>(raw);
  if (!out?.action) return Response.json({ reply: String(out?.reply ?? "I can't do that on the laptop yet.").slice(0, 300) });
  const v = validateAction(out.action, out.params);
  if (!v.ok || !can.has(v.action)) return Response.json({ reply: v.ok ? "Your laptop can't do that yet." : v.error });

  const { data: job, error } = await db
    .from("agent_jobs")
    .insert({ action: v.action, params: v.params, reason: String(out.reason ?? "").slice(0, 200), source: "me", status: "proposed" })
    .select("*")
    .single();
  if (error) return Response.json({ error: error.message.includes("agent_jobs") ? "Run supabase/007_sleep_agent.sql in Supabase first (one time)." : error.message }, { status: 500 });
  return Response.json({ job });
}
