// Applies supabase/*.sql to the database on every deploy, so nothing has to be pasted into the SQL Editor.
// Runs before `next build`. Each file is applied once, and again only if it changes, so every file must be
// safe to re-run (create ... if not exists, drop policy if exists, ...).
// Needs a Postgres connection string. The Vercel + Supabase integration adds POSTGRES_URL_NON_POOLING on its own;
// otherwise add SUPABASE_DB_URL in Vercel (Supabase → Connect → Session pooler).
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const DIR = join(process.cwd(), "supabase");
const url = ["SUPABASE_DB_URL", "POSTGRES_URL_NON_POOLING", "DATABASE_URL", "POSTGRES_URL"].map((k) => process.env[k]).find(Boolean);
const onVercel = Boolean(process.env.VERCEL);

// Preview deploys of unmerged branches share the same database, so only production changes it.
if (onVercel && process.env.VERCEL_ENV !== "production") {
  console.log(`migrate: ${process.env.VERCEL_ENV} deploy, skipping (only production deploys change the database).`);
  process.exit(0);
}

if (!url) {
  console.log(onVercel ? "migrate: no database URL in Vercel, skipping. Add SUPABASE_DB_URL to apply SQL automatically." : "migrate: no database URL, skipping.");
  process.exit(0);
}

// schema.sql first, then 002_..., 003_..., in order.
const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort((a, b) => (a === "schema.sql" ? -1 : b === "schema.sql" ? 1 : a.localeCompare(b, "en", { numeric: true })));

// pg reads sslmode=require as "verify against system CAs", which Supabase's own CA fails. Encryption stays on.
const conn = new URL(url);
conn.searchParams.delete("sslmode");
const local = ["localhost", "127.0.0.1"].includes(conn.hostname);
const client = new pg.Client({ connectionString: conn.toString(), ssl: local ? false : { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });

try {
  await client.connect();
} catch (e) {
  // Never block a deploy because the database was briefly unreachable; the next deploy retries.
  console.warn(`migrate: could not connect (${e.message}), skipping.`);
  process.exit(0);
}

let failed = false;
try {
  await client.query(`
    create schema if not exists private;
    revoke all on schema private from public, anon, authenticated;
    create table if not exists private.migrations (name text primary key, checksum text not null, applied_at timestamptz not null default now());
  `);
  const { rows } = await client.query("select name, checksum from private.migrations");
  const done = new Map(rows.map((r) => [r.name, r.checksum]));

  for (const file of files) {
    const sql = readFileSync(join(DIR, file), "utf8");
    const sum = createHash("sha256").update(sql).digest("hex");
    if (done.get(file) === sum) continue;
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query(
        "insert into private.migrations (name, checksum) values ($1, $2) on conflict (name) do update set checksum = excluded.checksum, applied_at = now()",
        [file, sum],
      );
      await client.query("commit");
      console.log(`migrate: applied ${file}`);
    } catch (e) {
      await client.query("rollback").catch(() => {});
      console.error(`migrate: ${file} failed: ${e.message}`);
      failed = true;
      break;
    }
  }
  if (!failed) console.log("migrate: database is up to date.");
} finally {
  await client.end();
}

// A broken migration stops the deploy, so the live app never runs against tables it expects but doesn't have.
if (failed && onVercel) process.exit(1);
