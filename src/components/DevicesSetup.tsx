"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { b64url, getApprover, sha256Hex } from "@/lib/approver";
import { isOnline, KIND_ICON, loadDevices, type Device } from "@/lib/devices";
import { timeAgo } from "@/lib/time";

type Kind = "windows" | "android";
const SETUP: Record<Kind, { title: string; where: string; steps: string[] }> = {
  windows: {
    title: "Windows laptop",
    where: "Open PowerShell (Start → type PowerShell), paste, press Enter. No admin needed.",
    steps: ["Installs free Node.js if missing", "Starts hidden on every login", "Uninstall: delete %LOCALAPPDATA%\\SecondBrainAgent"],
  },
  android: {
    title: "Android phone",
    where: "Install Termux, Termux:API and Termux:Boot from F-Droid (all free). Open Termux, paste, press Enter.",
    steps: ["Open Termux:Boot once so it starts after a restart", "Settings → Apps → Termux → Battery → Unrestricted", "Allow storage when asked (for notes and files)"],
  },
};

// You → Devices: connect your laptop and phone, see what each one is doing, disconnect.
export default function DevicesSetup() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [err, setErr] = useState("");
  const [cmd, setCmd] = useState<{ kind: Kind; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [myKey, setMyKey] = useState("");

  const load = useCallback(() => {
    loadDevices()
      .then((ds) => {
        setDevices(ds);
        setErr("");
      })
      .catch((e) => setErr(e.message));
  }, []);

  useEffect(() => {
    getApprover()
      .then((k) => setMyKey(k.id))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  async function connect(kind: Kind) {
    setBusy(true);
    setErr("");
    try {
      const me = await getApprover();
      setMyKey(me.id);
      const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
      const name = kind === "windows" ? "Laptop" : "Phone";
      const { data, error } = await supabase.from("devices").insert({ name, kind, token_hash: await sha256Hex(token) }).select("id").single();
      if (error) throw new Error(/devices/.test(error.message) ? "The agent's database tables aren't in yet. They go in with the next deploy (supabase/009_agent.sql)." : error.message);
      const origin = location.origin;
      const code = b64url(new TextEncoder().encode(JSON.stringify({ a: origin, t: token, d: data.id, p: [{ id: me.id, name: me.name, pub: me.pub }] })));
      const text =
        kind === "windows"
          ? `$env:SB_APP='${origin}'; $env:SB_PAIR='${code}'; irm ${origin}/agent/install.ps1 | iex`
          : `SB_APP='${origin}' SB_PAIR='${code}' bash -c "$(curl -fsSL ${origin}/agent/install-termux.sh)"`;
      setCmd({ kind, text });
      load();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }

  async function rename(d: Device) {
    const name = prompt("Name this device", d.name)?.trim();
    if (!name) return;
    await supabase.from("devices").update({ name: name.slice(0, 40) }).eq("id", d.id);
    load();
  }

  async function remove(d: Device) {
    if (!confirm(`Disconnect ${d.name}? Its agent stops working straight away. To use it again, connect it again.`)) return;
    await supabase.from("devices").update({ revoked: true }).eq("id", d.id);
    load();
  }

  const copy = (text: string) => navigator.clipboard.writeText(text).then(() => setCopied(true));

  return (
    <div id="devices" className="card scroll-mt-20 space-y-3">
      <div>
        <p className="label">🛰️ Laptop + phone agent</p>
        <p className="text-xs text-zinc-500">
          A small free program on your devices. It notices things (screen going black too fast, disk nearly full, an Obsidian vault to sync) and suggests a fix on Today. You can also ask it things. It only acts when you tap yes, and every yes is
          signed by this browser, so not even the server can make it run anything.
        </p>
      </div>

      {myKey && (
        <p className="rounded-xl bg-zinc-500/5 px-3 py-2 text-xs text-zinc-500">
          This browser&apos;s code: <span className="font-mono font-semibold text-zinc-800 dark:text-zinc-200">{myKey.match(/.{1,4}/g)?.join("-")}</span>. If a device asks to trust a new browser, check its code matches this one.
        </p>
      )}

      {devices.map((d) => {
        const i = d.info ?? {};
        return (
          <div key={d.id} className="rounded-2xl border p-3" style={{ borderColor: "var(--line)" }}>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{KIND_ICON[d.kind]}</span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <span className={`h-2 w-2 rounded-full ${isOnline(d) ? "bg-emerald-500" : "bg-zinc-400"}`} />
                  {d.name}
                </p>
                <p className="truncate text-xs text-zinc-500">{d.last_seen ? `${isOnline(d) ? "Online" : "Last seen"} ${timeAgo(d.last_seen)}${i.host ? ` · ${i.host}` : ""}${i.agent ? ` · v${i.agent}` : ""}` : "Waiting for the install command…"}</p>
              </div>
              <button className="chip text-xs" onClick={() => rename(d)}>
                Rename
              </button>
              <button className="chip text-xs text-rose-600" onClick={() => remove(d)}>
                Disconnect
              </button>
            </div>
            {d.last_seen && (
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-zinc-500">
                {i.battery !== undefined && <span className="rounded-full bg-zinc-500/10 px-2 py-0.5">🔋 {i.battery}%{i.charging ? " charging" : ""}</span>}
                {i.disk_free !== undefined && <span className="rounded-full bg-zinc-500/10 px-2 py-0.5">💾 {(i.disk_free / 1e9).toFixed(0)} GB free</span>}
                {i.screen_off_min !== undefined && <span className="rounded-full bg-zinc-500/10 px-2 py-0.5">🖥️ screen off {i.screen_off_min ? `after ${i.screen_off_min} min` : "never"}</span>}
                <span className="rounded-full bg-zinc-500/10 px-2 py-0.5">🗂️ {i.vault ? `notes synced from ${i.vault.path.split(/[\\/]/).pop()} (${i.vault.notes})` : "no notes folder yet"}</span>
                <span className="rounded-full bg-zinc-500/10 px-2 py-0.5">⌨️ commands {i.shell ? "allowed" : "off"}</span>
                {myKey && i.trusted && <span className="rounded-full bg-zinc-500/10 px-2 py-0.5">{i.trusted.includes(myKey) ? "🔑 trusts this browser" : "🔑 doesn't trust this browser yet"}</span>}
              </div>
            )}
          </div>
        );
      })}

      {cmd ? (
        <div className="space-y-2 rounded-2xl bg-zinc-500/5 p-3">
          <p className="text-sm font-medium">Connect your {SETUP[cmd.kind].title}</p>
          <p className="text-xs text-zinc-500">{SETUP[cmd.kind].where}</p>
          <code className="block max-h-24 overflow-auto break-all rounded-xl bg-[var(--surface)] p-2 text-[11px]">{cmd.text}</code>
          <button className="btn btn-accent w-full" onClick={() => copy(cmd.text)}>
            {copied ? "Copied ✓" : "Copy command"}
          </button>
          <ul className="list-disc pl-5 text-xs text-zinc-500">
            {SETUP[cmd.kind].steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
            <li>The command holds a secret for this device only. Don&apos;t share it.</li>
          </ul>
          <button className="text-xs text-zinc-500 underline" onClick={() => setCmd(null)}>
            Done
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button className="chip py-2.5" disabled={busy} onClick={() => connect("windows")}>
            💻 Connect laptop
          </button>
          <button className="chip py-2.5" disabled={busy} onClick={() => connect("android")}>
            📱 Connect phone
          </button>
        </div>
      )}

      <details className="text-xs text-zinc-500">
        <summary className="cursor-pointer">How it stays safe</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Every yes is signed with a key made in this browser that never leaves it. The agent checks the signature against keys it trusts locally, so a leaked database or server still can&apos;t make it act.</li>
          <li>Running a command, reading a file, syncing a folder or trusting a new browser also needs a Yes on the device&apos;s own screen, showing exactly what will happen. A hacked website can&apos;t fake that.</li>
          <li>A new browser has to be allowed by one the device already trusts, after you check its code matches.</li>
          <li>The command you paste works once. The device then makes its own secret that never leaves it.</li>
          <li>It only knows a fixed list of actions. &quot;Run a command&quot; is off until you switch it on, on the device itself: <code>node second-brain-agent.mjs shell on</code></li>
          <li>Your files stay on the device. Only status (battery, storage) and the results of actions you approve are sent, plus notes from a folder you choose to sync.</li>
          <li>Free and open source: read the agent at <a className="underline" href="https://github.com/abizar-huseni/second-brain/blob/main/public/agent/second-brain-agent.mjs" target="_blank" rel="noreferrer">public/agent</a>.</li>
        </ul>
      </details>
      {err && <p className="text-xs text-amber-600">{err}</p>}
    </div>
  );
}
