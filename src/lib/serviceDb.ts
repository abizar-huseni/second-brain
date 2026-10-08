// Server-only: full-access Supabase client for jobs that run without a login
// (phone webhooks, Google script, heartbeat). Every query must filter by user_id.
import { timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function serviceDb(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}

// Each live source sends its own key in the x-sync-token header (Me → Live connections), so a leaked
// Google script key can't post watch data and vice versa. The old shared sync token still works for a
// source until that source has its own key, so nothing has to be set up again.
export async function fromSyncToken(req: Request, source: "watch" | "google") {
  const db = serviceDb();
  if (!db) return { error: Response.json({ error: "Server missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 }) };
  // Header only: tokens in URLs end up in server logs.
  const token = req.headers.get("x-sync-token");
  if (!token) return { error: Response.json({ error: "Missing x-sync-token" }, { status: 401 }) };
  const owner = await ownerId();
  const denied = { error: Response.json({ error: "Invalid token" }, { status: 401 }) };
  if (!owner) return denied;

  const { data: keys, error } = await db.from("source_keys").select("source, token").eq("user_id", owner);
  const own = error ? undefined : keys?.find((k) => k.source === source);
  if (own) return safeEqual(own.token, token) ? { db, userId: owner } : denied;

  const { data } = await db.from("sync_tokens").select("token").eq("user_id", owner).maybeSingle();
  return data && safeEqual(data.token, token) ? { db, userId: owner } : denied;
}

// The heartbeat (pg_cron, see supabase/010_source_keys.sql) sends a server-only secret instead.
// Until that file is applied, it still sends the shared sync token, which keeps working only until then.
export async function fromCron(req: Request) {
  const db = serviceDb();
  if (!db) return { error: Response.json({ error: "Server missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 }) };
  const owner = await ownerId();
  const denied = { error: Response.json({ error: "Invalid heartbeat secret" }, { status: 401 }) };
  if (!owner) return denied;
  const { data: secret } = await db.from("app_secrets").select("value").eq("key", "cron_secret").maybeSingle();
  if (secret) return safeEqual(secret.value, req.headers.get("x-cron-secret") ?? "") ? { db, userId: owner } : denied;
  const token = req.headers.get("x-sync-token") ?? "";
  const { data } = await db.from("sync_tokens").select("token").eq("user_id", owner).maybeSingle();
  return data && safeEqual(data.token, token) ? { db, userId: owner } : denied;
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// The owner is the first account ever created. Cached per server instance.
let owner: string | null = null;
export async function ownerId() {
  if (owner) return owner;
  const db = serviceDb();
  if (!db) return null;
  const { data, error } = await db.rpc("owner_id");
  if (!error && data) return (owner = data as string);
  // Fallback before supabase/007_lockdown.sql is applied.
  const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const first = [...(list?.users ?? [])].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))[0];
  return (owner = first?.id ?? null);
}

// Records when each live source last worked. Ignores errors so a missing table never breaks a sync.
export async function setStatus(db: SupabaseClient, userId: string, source: string, patch: { ok?: boolean; error?: string; info?: unknown }) {
  const row: Record<string, unknown> = { user_id: userId, source };
  if (patch.ok) {
    row.last_ok = new Date().toISOString();
    row.last_error = null;
  }
  if (patch.error) row.last_error = patch.error.slice(0, 300);
  if (patch.info !== undefined) row.info = patch.info;
  await db.from("sync_status").upsert(row, { onConflict: "user_id,source" });
}
