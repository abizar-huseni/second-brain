import { aiConfigured, chat, parseJson } from "@/lib/ai";
import { CATALOG, checkParams, describe, matchIntent, type DeviceKind } from "@/lib/agentCatalog";
import { userDb } from "@/lib/serverDb";

export const maxDuration = 30;

type Pick = { device_id?: string; action?: string; params?: Record<string, unknown>; title?: string; why?: string; reply?: string };

// "Stop my screen going black" → a proposed action you then approve. Nothing runs from here:
// the device only acts on an approval signed in your browser.
export async function POST(req: Request) {
  const db = await userDb(req);
  if (!db) return Response.json({ error: "Sign in first" }, { status: 401 });
  const { text, device_id } = (await req.json().catch(() => ({}))) as { text?: string; device_id?: string };
  if (!text?.trim()) return Response.json({ error: "Say what you want done" }, { status: 400 });

  const { data: devices } = await db.from("devices").select("id, name, kind, info, last_seen").eq("revoked", false);
  if (!devices?.length) return Response.json({ error: "Connect a device first (Me page)." }, { status: 400 });
  const pool = device_id ? devices.filter((d) => d.id === device_id) : devices;
  if (!pool.length) return Response.json({ error: "Unknown device" }, { status: 400 });

  let pick: Pick | null = null;
  if (aiConfigured()) {
    const menu = Object.entries(CATALOG)
      .map(([name, c]) => `- ${name} [${c.on.join("/")}] ${c.label}. params: ${JSON.stringify(Object.fromEntries(Object.entries(c.params).map(([k, p]) => [k, `${p.type}${p.options ? ` one of ${p.options.join("|")}` : ""}${p.min !== undefined ? ` ${p.min}-${p.max}` : ""}${p.hint ? ` (${p.hint})` : ""}${p.optional ? " optional" : ""}`])))}`)
      .join("\n");
    const system = `You turn a request into ONE action for the user's own device agent. Devices:
${pool.map((d) => `- id ${d.id}: "${d.name}" (${d.kind}) status ${JSON.stringify(d.info ?? {}).slice(0, 400)}`).join("\n")}
Actions (only these, only on the listed device kinds):
${menu}
Prefer a specific action over "run". Use "run" only when nothing else fits, with a short, safe ${pool[0].kind === "windows" ? "PowerShell" : "shell"} command that does exactly what was asked and nothing destructive.
Reply with JSON only: {"device_id":"...","action":"...","params":{...},"title":"short, in the user's words","why":"one line"}.
If it can't be done with these actions, reply {"reply":"one short sentence saying so and what you can do instead"}.`;
    try {
      pick = parseJson<Pick>(await chat(system, text.slice(0, 1000)));
    } catch (e) {
      if (!/limit/i.test((e as Error).message)) return Response.json({ error: (e as Error).message }, { status: 502 });
    }
  }
  if (!pick) {
    for (const d of pool) {
      const m = matchIntent(text, d.kind as DeviceKind);
      if (m) {
        pick = { device_id: d.id, ...m };
        break;
      }
    }
  }
  if (!pick || pick.reply || !pick.action) return Response.json({ reply: pick?.reply ?? "I couldn't match that to something your devices can do. Try \"keep my screen on\", \"find my phone\" or \"close discord\"." });

  const device = pool.find((d) => d.id === pick.device_id) ?? pool[0];
  const item = CATALOG[pick.action];
  if (!item || !item.on.includes(device.kind as DeviceKind)) return Response.json({ reply: `${device.name} can't do "${pick.action}".` });
  const checked = checkParams(pick.action, pick.params ?? {});
  if (!checked.ok) return Response.json({ reply: checked.error });

  const { data, error } = await db
    .from("device_actions")
    .insert({ device_id: device.id, source: "me", action: pick.action, params: checked.params, title: (pick.title || item.label).slice(0, 200), why: pick.why?.slice(0, 500) ?? null })
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ action: data, says: describe(pick.action, checked.params) });
}
