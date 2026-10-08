"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { timeAgo } from "@/lib/time";

type Status = { source: string; last_ok: string | null; last_error: string | null; info: Record<string, unknown> | null };

const SCRIPT_URL = "https://github.com/abizar-huseni/second-brain/blob/main/integrations/google-apps-script.js";
const APK_URL = "https://github.com/mcnaveen/health-connect-webhook/releases";

// Everything that keeps the dashboard updated while your devices are off, with setup steps and live status.
export default function Connections() {
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<Status[]>([]);
  const [origin, setOrigin] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setOrigin(location.origin);
    supabase
      .from("sync_tokens")
      .select("token")
      .maybeSingle()
      .then(({ data, error }) => (error ? setMsg("The database is still setting up. It finishes on the next deploy.") : setToken(data?.token ?? null)));
    supabase
      .from("sync_status")
      .select("*")
      .then(({ data }) => setStatus(data ?? []));
  }, []);

  async function generate() {
    if (token && !confirm("Make a new token? The old one stops working, so you'll need to update the phone app and Google script.")) return;
    const fresh = crypto.randomUUID().replaceAll("-", "");
    const { error } = await supabase.from("sync_tokens").upsert({ token: fresh, created_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) return setMsg(`Error: ${error.message}`);
    setToken(fresh);
    setMsg("");
  }

  const copy = (text: string) => navigator.clipboard.writeText(text).then(() => setMsg("Copied."));
  const get = (source: string) => status.find((s) => s.source === source);

  if (!token) {
    return (
      <div className="card space-y-2">
        <p className="label">🔌 Live connections</p>
        <p className="text-sm">One secret token lets your watch, Gmail and the server update your dashboard on their own.</p>
        <button className="btn w-full" onClick={generate}>
          Create my sync token
        </button>
        {msg && <p className="text-sm text-zinc-500">{msg}</p>}
      </div>
    );
  }

  return (
    <div className="card space-y-4">
      <div>
        <p className="label">🔌 Live connections</p>
        <Field label="Your sync token (keep secret)" value={token} onCopy={() => copy(token)} />
        {msg && <p className="mt-1 text-xs text-zinc-500">{msg}</p>}
      </div>

      <Source icon="💓" name="Heartbeat" status={get("heartbeat")} hint="Every 30 min: syncs banks and writes your coach brief.">
        <p>Already on: the database sets it up on deploy. Nothing to do.</p>
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
        <p className="text-xs text-zinc-500">Header value: your sync token above.</p>
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
        <p className="text-xs text-zinc-500">SB_TOKEN: your sync token above.</p>
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
