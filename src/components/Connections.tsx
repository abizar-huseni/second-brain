"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { timeAgo } from "@/lib/time";

type Status = { source: string; last_ok: string | null; last_error: string | null; info: Record<string, unknown> | null };

const SCRIPT_URL = "https://github.com/abizar-huseni/second-brain/blob/main/integrations/google-apps-script.js";
const APK_URL = "https://github.com/mcnaveen/health-connect-webhook/releases";

type Kind = "watch" | "google";

// Everything that keeps the dashboard updated while your devices are off, with setup steps and live status.
// The watch and the Google script each have their own key, so a leaked one can only do one job.
export default function Connections() {
  const [shared, setShared] = useState<string | null>(null);
  const [keys, setKeys] = useState<Partial<Record<Kind, string>>>({});
  const [status, setStatus] = useState<Status[]>([]);
  const [origin, setOrigin] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setOrigin(location.origin);
    supabase
      .from("sync_tokens")
      .select("token")
      .maybeSingle()
      .then(({ data }) => setShared(data?.token ?? null));
    supabase
      .from("source_keys")
      .select("source, token")
      .then(({ data, error }) => {
        if (error) setMsg("The database is still setting up. It finishes on the next deploy.");
        else setKeys(Object.fromEntries((data ?? []).map((k) => [k.source, k.token])));
      });
    supabase
      .from("sync_status")
      .select("*")
      .then(({ data }) => setStatus(data ?? []));
  }, []);

  async function makeKey(kind: Kind) {
    const where = kind === "watch" ? "the HC Webhook app" : "the Google script";
    if ((keys[kind] || shared) && !confirm(`Make a new key for this? Then paste it into ${where}: the old one stops working there.`)) return;
    const fresh = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
    const { error } = await supabase.from("source_keys").upsert({ source: kind, token: fresh, created_at: new Date().toISOString() }, { onConflict: "user_id,source" });
    if (error) return setMsg(`Error: ${error.message}`);
    setKeys((k) => ({ ...k, [kind]: fresh }));
    setMsg(`New key made. Paste it into ${where} now.`);
  }

  const copy = (text: string) => navigator.clipboard.writeText(text).then(() => setMsg("Copied."));
  const get = (source: string) => status.find((s) => s.source === source);

  const KeyField = ({ kind, label }: { kind: Kind; label: string }) => {
    const value = keys[kind] ?? shared;
    return (
      <div className="space-y-1">
        {value ? <Field label={`${label} (keep secret)`} value={value} onCopy={() => copy(value)} /> : null}
        {!keys[kind] && shared && <p className="text-xs text-zinc-500">This is your old shared key. It still works, but a key just for this is safer.</p>}
        <button className="chip text-xs" onClick={() => makeKey(kind)}>
          {keys[kind] ? "Make a new key" : shared ? "Give it its own key" : "Create key"}
        </button>
      </div>
    );
  };

  return (
    <div className="card space-y-4">
      <div>
        <p className="label">🔌 Live connections</p>
        {msg && <p className="mt-1 text-xs text-zinc-500">{msg}</p>}
      </div>

      <Source icon="💓" name="Heartbeat" status={get("heartbeat")} hint="Every 30 min: syncs banks and writes your coach brief.">
        <p>Already on: the database sets it up on deploy, with its own secret. Nothing to do.</p>
      </Source>

      <Source icon="⌚" name="Watch" status={get("watch")} hint="Steps, sleep, heart rate as they happen.">
        <p>
          Install the free{" "}
          <a className="underline" href={APK_URL} target="_blank" rel="noreferrer">
            HC Webhook APK
          </a>
          , allow Health Connect, add a webhook with:
        </p>
        <Field label="URL" value={`${origin}/api/health/webhook`} onCopy={() => copy(`${origin}/api/health/webhook`)} />
        <Field label="Header" value="x-sync-token" onCopy={() => copy("x-sync-token")} />
        <KeyField kind="watch" label="Header value" />
      </Source>

      <Source icon="📧" name="Gmail + Calendar" status={get("google")} hint="New emails and your week, every 10 min.">
        <p>
          Open the{" "}
          <a className="underline" href={SCRIPT_URL} target="_blank" rel="noreferrer">
            Google script
          </a>{" "}
          and follow the 4 steps at the top. Script properties:
        </p>
        <Field label="SB_URL" value={`${origin}/api/ingest/google`} onCopy={() => copy(`${origin}/api/ingest/google`)} />
        <KeyField kind="google" label="SB_TOKEN" />
      </Source>

      <Source icon="🏦" name="Banks" status={get("bank")} hint="Lloyds + HSBC every 2 hours via Lunch Flow.">
        <p>Works automatically once LUNCHFLOW_API_KEY is in Vercel and the heartbeat is on. Without it, import CSVs on the Money page.</p>
      </Source>
    </div>
  );
}

function Source({ icon, name, status, hint, children }: { icon: string; name: string; status?: Status; hint: string; children: React.ReactNode }) {
  const ok = status?.last_ok && !status.last_error;
  return (
    <details className="group rounded-xl border border-zinc-200 p-3 dark:border-zinc-800" open={!status?.last_ok}>
      <summary className="flex cursor-pointer list-none items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{name}</p>
          <p className="truncate text-xs text-zinc-500">{hint}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
            status?.last_error ? "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300" : ok ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"
          }`}
        >
          {status?.last_error ? "⚠️ error" : ok ? `● ${timeAgo(status.last_ok)}` : "not set up"}
        </span>
      </summary>
      <div className="mt-3 space-y-2 text-sm">
        {status?.last_error && <p className="text-xs text-amber-600">{status.last_error}</p>}
        {children}
      </div>
    </details>
  );
}

function Field({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <div>
      <p className="text-xs text-zinc-500">{label}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded bg-zinc-100 px-2 py-1 text-xs dark:bg-zinc-800">{value}</code>
        <button className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700" onClick={onCopy}>
          Copy
        </button>
      </div>
    </div>
  );
}
