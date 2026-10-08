"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { callApi, errorText } from "@/lib/api";
import { CATALOG, describe, RISK_STYLE } from "@/lib/agentCatalog";
import { approve, isOnline, KIND_ICON, loadDevices, reject, type Device, type DeviceAction } from "@/lib/devices";
import { getApprover } from "@/lib/approver";
import { timeAgo } from "@/lib/time";
import { useAssistantName } from "@/lib/useAssistant";

const SOURCE = { me: "You asked", ai: "Suggested", device: "Noticed" } as const;
const EXAMPLES = ["Stop my screen going black", "Keep the laptop awake for 2 hours", "Close Discord, I need to focus", "Find my phone"];

// Today → Now: what your laptop and phone want to do, waiting for your yes. Nothing runs without it.
// quiet: on Today, show nothing until a device is paired (setup lives on You).
export default function DevicesCard({ quiet }: { quiet?: boolean }) {
  const assistant = useAssistantName();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [actions, setActions] = useState<DeviceAction[]>([]);
  const [myKey, setMyKey] = useState("");
  const [ask, setAsk] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const ds = await loadDevices();
      setDevices(ds);
      if (!ds.length) return;
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { data } = await supabase
        .from("device_actions")
        .select("*")
        .or(`status.in.(proposed,approved,running),finished_at.gte.${since}`)
        .order("created_at", { ascending: false })
        .limit(20);
      setActions((data ?? []) as DeviceAction[]);
    } catch {
      setDevices([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const paired = Boolean(devices?.length);
  useEffect(() => {
    if (paired)
      getApprover()
        .then((k) => setMyKey(k.id))
        .catch(() => {});
  }, [paired]);

  // Check back quickly while something is running, slowly otherwise.
  const live = actions.some((a) => a.status === "approved" || a.status === "running");
  useEffect(() => {
    const t = setInterval(load, live ? 3000 : 30000);
    return () => clearInterval(t);
  }, [load, live]);

  if (devices === null) return null;

  if (!devices.length) {
    if (quiet) return null;
    return (
      <Link href="/me#devices" className="card card-link flex items-center gap-3">
        <span className="text-2xl">💻</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Let your assistant help on your laptop and phone</p>
          <p className="text-xs text-zinc-500">It suggests fixes, you tap yes. Free, runs on your own devices.</p>
        </div>
        <span className="text-zinc-400">→</span>
      </Link>
    );
  }

  const name = (id: string) => devices.find((d) => d.id === id)?.name ?? "Device";
  const pending = actions.filter((a) => a.status === "proposed" && (!a.expires_at || Date.parse(a.expires_at) > Date.now()));
  const recent = actions.filter((a) => a.status !== "proposed" && a.status !== "rejected" && a.status !== "expired").slice(0, 4);

  async function decide(a: DeviceAction, yes: boolean) {
    setBusy(a.id);
    setMsg("");
    try {
      if (yes) {
        const d = devices!.find((x) => x.id === a.device_id);
        if (myKey && d?.info?.trusted && !d.info.trusted.includes(myKey) && a.action !== "trust_key") {
          setMsg(`${d.name} doesn't trust this browser yet. It will ask you to allow it: approve that from a browser you paired with.`);
        }
        await approve(a);
      } else await reject(a);
      await load();
    } catch (e) {
      setMsg(errorText(e));
    }
    setBusy("");
  }

  async function send(text: string) {
    if (!text.trim()) return;
    setBusy("ask");
    setMsg("");
    try {
      const r = await callApi<{ reply?: string }>("/api/agent/ask", { text });
      if (r.reply) setMsg(r.reply);
      else setAsk("");
      await load();
    } catch (e) {
      setMsg(errorText(e));
    }
    setBusy("");
  }

  return (
    <div id="devices" className="card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="label mb-0">🛰️ Your devices</p>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {devices.map((d) => (
            <Link key={d.id} href="/me#devices" className="flex shrink-0 items-center gap-1 rounded-full bg-zinc-500/10 px-2 py-0.5 text-xs">
              <span className={`h-1.5 w-1.5 rounded-full ${isOnline(d) ? "bg-emerald-500" : "bg-zinc-400"}`} />
              {KIND_ICON[d.kind]} {d.name}
              {d.info?.battery !== undefined && <span className="text-zinc-500">{d.info.charging ? "⚡" : ""}{d.info.battery}%</span>}
            </Link>
          ))}
        </div>
      </div>

      {pending.map((a) => {
        const item = CATALOG[a.action];
        const high = !item || item.risk === "high";
        return (
          <div key={a.id} className="pop rounded-2xl border-l-4 border-l-[var(--accent)] bg-zinc-500/5 p-3">
            <div className="flex items-start gap-2">
              <span className="text-xl">{item?.icon ?? "❔"}</span>
              <div className="min-w-0 flex-1">
                {high && (
                  <pre className="mb-2 whitespace-pre-wrap break-all rounded-xl bg-rose-500/10 px-2.5 py-2 text-xs font-semibold text-rose-800 dark:text-rose-200">
                    {describe(a.action, a.params)}
                  </pre>
                )}
                <p className="text-sm font-medium">{a.title}</p>
                <p className="text-[11px] text-zinc-500">
                  {a.source === "ai" ? `${assistant} suggests` : SOURCE[a.source]} · {name(a.device_id)} · {timeAgo(a.created_at)}
                </p>
                {a.why && <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{a.why}</p>}
                {!high && (
                  <p className="mt-2 rounded-xl bg-[var(--surface)] px-2.5 py-1.5 text-xs">
                    <span className={`mr-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase ${RISK_STYLE[item.risk]}`}>{item.risk}</span>
                    {describe(a.action, a.params)}
                  </p>
                )}
                {high && <p className="mt-1 text-[11px] text-zinc-500">Your {name(a.device_id).toLowerCase()} will also ask you on its own screen before doing this.</p>}
              </div>
            </div>
            <div className="mt-2 flex gap-2">
              <button className="btn btn-accent flex-1" disabled={busy === a.id} onClick={() => decide(a, true)}>
                {busy === a.id ? "Signing…" : "Yes, do it"}
              </button>
              <button className="chip" disabled={busy === a.id} onClick={() => decide(a, false)}>
                No
              </button>
            </div>
          </div>
        );
      })}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(ask);
        }}
      >
        <input className="input" placeholder="Tell your laptop or phone what to do…" value={ask} onChange={(e) => setAsk(e.target.value)} />
        <button className="btn" disabled={busy === "ask" || !ask.trim()}>
          {busy === "ask" ? "…" : "Ask"}
        </button>
      </form>
      {!pending.length && !recent.length && (
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((x) => (
            <button key={x} className="chip text-xs" onClick={() => send(x)}>
              {x}
            </button>
          ))}
        </div>
      )}
      {msg && <p className="text-xs text-zinc-500">{msg}</p>}

      {recent.length > 0 && (
        <div className="space-y-1">
          {recent.map((a) => (
            <button key={a.id} className="block w-full text-left" onClick={() => setOpen(open === a.id ? null : a.id)}>
              <p className="flex items-center gap-2 text-xs">
                <span>{a.status === "done" ? "✅" : a.status === "failed" ? "⚠️" : "⏳"}</span>
                <span className="min-w-0 flex-1 truncate">{a.title}</span>
                <span className="shrink-0 text-zinc-400">{a.status === "approved" ? "waiting for device" : a.status === "running" ? "running" : timeAgo(a.finished_at)}</span>
              </p>
              {open === a.id && a.result && <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap rounded-xl bg-zinc-500/10 p-2 text-[11px]">{a.result}</pre>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
