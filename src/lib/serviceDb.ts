// Server-only: full-access Supabase client for jobs that run without a login
// (phone webhooks, Google script, heartbeat). Every query must filter by user_id.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function serviceDb(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}

// The sync token (Me page) identifies whose data this is.
export async function fromSyncToken(req: Request) {
  const db = serviceDb();
  if (!db) return { error: Response.json({ error: "Server missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 }) };
  // Header only: tokens in URLs end up in server logs.
  const token = req.headers.get("x-sync-token");
  if (!token) return { error: Response.json({ error: "Missing x-sync-token" }, { status: 401 }) };
  const { data } = await db.from("sync_tokens").select("user_id").eq("token", token).maybeSingle();
  if (!data || data.user_id !== (await ownerId())) return { error: Response.json({ error: "Invalid token" }, { status: 401 }) };
  return { db, userId: data.user_id as string };
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
