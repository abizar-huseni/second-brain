import { describeJob } from "@/lib/agentActions";
import { fromSyncToken } from "@/lib/serviceDb";

// Brain Link reports back after running a job you approved.
export async function POST(req: Request) {
  const auth = await fromSyncToken(req);
  if ("error" in auth) return auth.error;
  const { db, userId } = auth;
  if (Number(req.headers.get("content-length") ?? 0) > 120_000) return Response.json({ error: "Too big" }, { status: 413 });
  const body = (await req.json().catch(() => ({}))) as { id?: string; ok?: boolean; result?: unknown; error?: string };
  if (typeof body.id !== "string" || !/^[0-9a-f-]{36}$/.test(body.id)) return Response.json({ error: "Bad job id" }, { status: 400 });

  const { data: job } = await db.from("agent_jobs").select("id, action, params").eq("id", body.id).eq("user_id", userId).eq("status", "running").maybeSingle();
  if (!job) return Response.json({ error: "No such running job" }, { status: 404 });

  let result: unknown = body.ok ? body.result ?? null : { error: String(body.error ?? "Failed").slice(0, 500) };
  if (JSON.stringify(result ?? null).length > 30_000) result = { note: "Result too long to keep" };
  await db
    .from("agent_jobs")
    .update({ status: body.ok ? "done" : "failed", result, done_at: new Date().toISOString() })
    .eq("id", job.id)
    .eq("user_id", userId);

  // A document you chose to share becomes a thought, so the assistant files and remembers it.
  const r = result as { path?: string; text?: string } | null;
  if (body.ok && job.action === "read_file" && r?.text) {
    await db.from("notes").insert({ user_id: userId, body: `📄 From your laptop: ${String(r.path ?? "").slice(0, 200)}\n\n${String(r.text).slice(0, 6000)}`, processed: false });
  }
  return Response.json({ ok: true, done: describeJob(job.action, job.params as Record<string, unknown>) });
}
