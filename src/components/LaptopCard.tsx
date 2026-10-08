"use client";
// Brain Link: ask your laptop for something, approve what the assistant suggests, see what happened.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { callApi, errorText } from "@/lib/api";
import { ACTIONS, describeJob, isAction } from "@/lib/agentActions";
import { timeAgo } from "@/lib/time";
import { success, tap } from "@/lib/haptics";

type Job = { id: string; action: string; params: Record<string, unknown>; reason: string | null; status: string; result: Record<string, unknown> | null; created_at: string; source: string };
type Device = { device_id: string; name: string | null; os: string | null; info: { battery?: number | null; charging?: boolean | null; disk_free_gb?: number | null } | null; last_seen: string };

const SETUP = "https://github.com/abizar-huseni/second-brain/tree/main/agent";
const online = (d: Device) => Date.now() - Date.parse(d.last_seen) < 2 * 60_000;

export function useLaptop(poll = true) {
  const [device, setDevice] = useState<Device | null | undefined>(undefined);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [ready, setReady] = useState(true);
  const load = useCallback(async () => {
    const [d, j] = await Promise.all([
      supabase.from("agent_devices").select("device_id, name, os, info, last_seen").order("last_seen", { ascending: false }).limit(1),
      supabase.from("agent_jobs").select("*").order("created_at", { ascending: false }).limit(12),
    ]);
    if (d.error || j.error) setReady(false); // database not upgraded yet
    setDevice((d.data?.[0] as Device) ?? null);
    setJobs((j.data ?? []) as Job[]);
  }, []);
  useEffect(() => {
    load();
    if (!poll) return;
    const t = setInterval(() => document.visibilityState === "visible" && load(), 8000);
    return () => clearInterval(t);
  }, [load, poll]);

  async function decide(job: Job, approve: boolean) {
    if (approve) success();
    else tap();
    setJobs((js) => js.map((j) => (j.id === job.id ? { ...j, status: approve ? "approved" : "denied" } : j)));
    await supabase.from("agent_jobs").update({ status: approve ? "approved" : "denied", decided_at: new Date().toISOString() }).eq("id", job.id).eq("status", "proposed");
    load();
  }
  return { device, jobs, ready, decide, reload: load };
}

// Approve / Not now for one suggestion. Also used on Today.
export function JobCard({ job, onDecide }: { job: Job; onDecide: (job: Job, approve: boolean) => void }) {
  const a = isAction(job.action) ? ACTIONS[job.action] : null;
  return (
    <div className="rise flex items-start gap-3 rounded-2xl border p-3" style={{ borderColor: "var(--border)" }}>
      <span className="text-2xl leading-none">{a?.emoji ?? "💻"}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{describeJob(job.action, job.params)}</p>
        {job.reason && <p className="text-xs muted">{job.reason}</p>}
        <div className="mt-2 flex gap-2">
          <button className="btn-accent !py-1.5" onClick={() => onDecide(job, true)}>Approve</button>
          <button className="btn-ghost !py-1.5" onClick={() => onDecide(job, false)}>Not now</button>
        </div>
      </div>
    </div>
  );
}

const STATUS: Record<string, string> = { approved: "⏳ waiting for laptop", running: "⚙️ working", done: "✅", failed: "⚠️", denied: "skipped", expired: "expired (laptop was off)" };

export default function LaptopCard() {
  const { device, jobs, ready, decide, reload } = useLaptop();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  async function askLaptop() {
    if (!text.trim()) return;
    setBusy(true);
    setReply("");
    tap();
    try {
      const out = await callApi<{ job?: Job; reply?: string }>("/api/agent/ask", { text });
      if (out.reply) setReply(out.reply);
      setText("");
      reload();
    } catch (e) {
      setReply(errorText(e));
    }
    setBusy(false);
  }

  if (device === undefined) return <div className="skeleton h-32 rounded-[1.35rem]" />;
  const proposed = jobs.filter((j) => j.status === "proposed");
  const recent = jobs.filter((j) => j.status !== "proposed").slice(0, 4);

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <p className="label !mb-0">💻 Laptop</p>
        {device ? (
          <span className="flex items-center gap-1.5 text-xs muted">
            <span className={`h-2 w-2 rounded-full ${online(device) ? "live-dot bg-emerald-400" : "bg-zinc-400"}`} />
            {device.name ?? "Laptop"} · {online(device) ? "online" : `seen ${timeAgo(device.last_seen)}`}
            {device.info?.battery != null && ` · ${device.info.charging ? "⚡" : "🔋"}${device.info.battery}%`}
          </span>
        ) : (
          <a href={SETUP} target="_blank" rel="noreferrer" className="text-xs text-emerald-500 underline">Set it up ↗</a>
        )}
      </div>

      {!ready && <p className="text-xs text-amber-500">Run supabase/007_sleep_agent.sql in Supabase once to switch this on.</p>}
      {!device && ready && (
        <p className="text-sm muted">Let your assistant fix things on your laptop, like the screen going black too soon. You approve every action. Setup takes 10 minutes.</p>
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          askLaptop();
        }}
      >
        <input className="input" placeholder="Ask your laptop… e.g. my screen keeps going black" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn shrink-0" disabled={busy || !text.trim()}>{busy ? "…" : "Ask"}</button>
      </form>
      {reply && <p className="text-sm muted">{reply}</p>}

      {proposed.map((j) => (
        <JobCard key={j.id} job={j} onDecide={decide} />
      ))}

      {recent.length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {recent.map((j) => {
            const msg = (j.result?.message as string | undefined) ?? (j.result?.error as string | undefined);
            const files = (j.result?.files as { path: string }[] | undefined) ?? [];
            return (
              <li key={j.id}>
                <button className="flex w-full items-start justify-between gap-2 text-left" onClick={() => setOpen(open === j.id ? null : j.id)}>
                  <span className="min-w-0 truncate">{describeJob(j.action, j.params)}</span>
                  <span className="shrink-0 text-xs muted">{STATUS[j.status] ?? j.status}</span>
                </button>
                {open === j.id && (msg || files.length > 0) && (
                  <div className="fade mt-1 rounded-xl bg-zinc-500/10 p-2 text-xs">
                    {msg && <p>{msg}</p>}
                    {files.slice(0, 10).map((f) => (
                      <p key={f.path} className="truncate muted">{f.path}</p>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// On Today: only shows up when the assistant is waiting for your OK.
export function Approvals() {
  const { jobs, decide } = useLaptop(false);
  const proposed = jobs.filter((j) => j.status === "proposed");
  if (!proposed.length) return null;
  return (
    <div className="card space-y-2">
      <p className="label">💻 Waiting for your OK</p>
      {proposed.slice(0, 3).map((j) => (
        <JobCard key={j.id} job={j} onDecide={decide} />
      ))}
    </div>
  );
}
