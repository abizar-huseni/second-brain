"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// Shows the webhook URL + secret token to paste into the HC Webhook app on your phone.
export default function LiveSync({ onRefresh }: { onRefresh: () => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setOrigin(location.origin);
    supabase
      .from("sync_tokens")
      .select("token")
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setMsg("Run supabase/005_live_health.sql first.");
        else setToken(data?.token ?? null);
      });
  }, []);

  async function generate() {
    if (token && !confirm("Make a new token? The old one stops working and you'll need to update the phone app.")) return;
    const fresh = crypto.randomUUID().replaceAll("-", "");
    const { error } = await supabase.from("sync_tokens").upsert({ token: fresh, created_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) return setMsg(`Error: ${error.message}`);
    setToken(fresh);
    setMsg("");
  }

  const copy = (text: string) => navigator.clipboard.writeText(text).then(() => setMsg("Copied."));
  const url = `${origin}/api/health/webhook`;

  return (
    <div className="card space-y-2">
      <p className="label">Live sync from your watch</p>
      <p className="text-xs text-zinc-500">
        Watch → Samsung Health → Health Connect → HC Webhook app → here. Install the free{" "}
        <a className="underline" href="https://github.com/mcnaveen/health-connect-webhook/releases" target="_blank" rel="noreferrer">
          app-foss-release.apk
        </a>{" "}
        from GitHub (the Play Store version is paid), give it Health Connect access, then add a webhook with this URL and header.
      </p>
      {token ? (
        <div className="space-y-2 text-sm">
          <Field label="Webhook URL" value={url} onCopy={() => copy(url)} />
          <Field label="Header name" value="x-sync-token" onCopy={() => copy("x-sync-token")} />
          <Field label="Header value (keep secret)" value={token} onCopy={() => copy(token)} />
          <div className="flex gap-2">
            <button className="flex-1 rounded-lg border border-zinc-300 py-1.5 text-sm dark:border-zinc-700" onClick={onRefresh}>
              Refresh charts
            </button>
            <button className="flex-1 rounded-lg border border-zinc-300 py-1.5 text-sm dark:border-zinc-700" onClick={generate}>
              New token
            </button>
          </div>
        </div>
      ) : (
        <button className="btn w-full" onClick={generate}>
          Create my sync token
        </button>
      )}
      {msg && <p className="text-sm text-zinc-500">{msg}</p>}
    </div>
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
