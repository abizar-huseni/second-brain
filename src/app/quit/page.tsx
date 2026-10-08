"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { cleanFor, hoursSince, MILESTONES, saved, TRIGGERS, type Craving, type Quit } from "@/lib/quit";
import { gbp } from "@/lib/money";
import QuitCard from "@/components/QuitCard";

export default function QuitPage() {
  const [quits, setQuits] = useState<Quit[]>([]);
  const [cravings, setCravings] = useState<Craving[]>([]);
  const [ready, setReady] = useState(false);
  const [form, setForm] = useState({ name: "Nicotine", cost: "", why: "", start: "" });
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const [q, c] = await Promise.all([
      supabase.from("quits").select("*").order("created_at"),
      supabase.from("cravings").select("*").gte("at", new Date(Date.now() - 30 * 86400000).toISOString()).order("at", { ascending: false }),
    ]);
    if (q.error) setMsg("The database is still setting up. It finishes on the next deploy.");
    setQuits(q.data ?? []);
    setCravings(c.data ?? []);
    setReady(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const quit = quits.find((q) => q.active);

  async function start() {
    const { error } = await supabase.from("quits").insert({
      name: form.name.trim() || "Nicotine",
      cost_per_week: Number(form.cost) || 0,
      why: form.why.trim(),
      started_at: form.start ? new Date(form.start).toISOString() : new Date().toISOString(),
    });
    if (error) return setMsg(error.message);
    load();
  }

  async function save(patch: Partial<Quit>) {
    if (!quit) return;
    await supabase.from("quits").update(patch).eq("id", quit.id);
    load();
  }

  if (!ready) return <div className="skeleton h-40" />;

  if (!quit) {
    return (
      <div className="rise space-y-4">
        <div className="card space-y-3">
          <p className="text-2xl font-semibold">Day one starts now. 🚭</p>
          <p className="text-sm text-zinc-500">Your brain counts every hour, every pound saved, and learns what sets your cravings off so it can warn you before they hit.</p>
          <div>
            <label className="label">Quitting</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">What it cost you per week (£)</label>
            <input className="input" type="number" min="0" inputMode="decimal" placeholder="e.g. 15" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
          </div>
          <div>
            <label className="label">Why you&apos;re quitting (shown when cravings hit)</label>
            <textarea className="input" rows={3} placeholder="In your own words. Make it hit." value={form.why} onChange={(e) => setForm({ ...form, why: e.target.value })} />
          </div>
          <div>
            <label className="label">Quit time (leave empty for now)</label>
            <input className="input" type="datetime-local" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
          </div>
          <button className="btn w-full py-3" onClick={start}>
            Start my quit
          </button>
          {msg && <p className="notice">{msg}</p>}
        </div>
      </div>
    );
  }

  const hours = hoursSince(quit.started_at);
  const mine = cravings.filter((c) => c.quit_id === quit.id);
  const beaten = mine.filter((c) => c.outcome === "beaten").length;
  const slips = mine.filter((c) => c.outcome === "slipped").length;
  const byTrigger = TRIGGERS.map((t) => ({ t, n: mine.filter((c) => c.trigger === t).length })).filter((x) => x.n);
  const byHour = Array.from({ length: 24 }, (_, h) => mine.filter((c) => new Date(c.at).getHours() === h).length);
  const maxT = Math.max(1, ...byTrigger.map((x) => x.n));
  const maxH = Math.max(1, ...byHour);

  return (
    <div className="stagger space-y-4">
      <QuitCard onChange={load} />

      <div className="grid grid-cols-3 gap-3">
        <Stat value={String(beaten)} label="Cravings beaten" />
        <Stat value={cleanFor(Math.max(Number(quit.longest_hours), hours)).split(" ").slice(0, 2).join(" ")} label="Longest run" />
        <Stat value={Number(quit.cost_per_week) > 0 ? gbp(saved(quit, hours)) : "–"} label="Saved" />
      </div>

      <div className="card space-y-3">
        <p className="label">🗺️ What&apos;s happening in your body</p>
        <ol className="relative space-y-3 border-l-2 border-zinc-200 pl-5 dark:border-zinc-700">
          {MILESTONES.map((m) => {
            const reached = hours >= m.hours;
            return (
              <li key={m.title} className={reached ? "" : "opacity-50"}>
                <span className={`absolute -left-[9px] mt-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[9px] text-white ${reached ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600"}`}>{reached ? "✓" : ""}</span>
                <p className="text-sm font-medium">{m.title}</p>
                <p className="text-xs text-zinc-500">{m.body}</p>
              </li>
            );
          })}
        </ol>
        <p className="text-[11px] text-zinc-400">Sources: NHS Better Health, NSW Health. Free support: the NHS Quit Smoking app and your local Stop Smoking Service.</p>
      </div>

      <div className="card space-y-3">
        <p className="label">🔍 Your craving pattern (30 days)</p>
        {!mine.length ? (
          <p className="text-sm text-zinc-500">Every time you tap &quot;I&apos;m craving&quot;, your brain learns when and why. After a few, it warns you before they hit.</p>
        ) : (
          <>
            <div className="space-y-1.5">
              {byTrigger.map((x) => (
                <div key={x.t} className="flex items-center gap-2 text-sm">
                  <span className="w-28 shrink-0 text-zinc-500">{x.t}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div className="h-full rounded-full bg-rose-400" style={{ width: `${(x.n / maxT) * 100}%` }} />
                  </div>
                  <span className="w-5 text-right tabular-nums">{x.n}</span>
                </div>
              ))}
            </div>
            <div>
              <p className="mb-1 text-xs text-zinc-500">By hour of day</p>
              <div className="flex h-16 items-end gap-0.5">
                {byHour.map((n, h) => (
                  <div key={h} title={`${h}:00 · ${n}`} className={`flex-1 rounded-t ${n ? "bg-rose-400" : "bg-zinc-100 dark:bg-zinc-800"}`} style={{ height: `${n ? (n / maxH) * 100 : 6}%` }} />
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-zinc-400">
                <span>00</span>
                <span>06</span>
                <span>12</span>
                <span>18</span>
                <span>23</span>
              </div>
            </div>
            <p className="text-xs text-zinc-500">
              {beaten} beaten, {slips} slip{slips === 1 ? "" : "s"}.
            </p>
          </>
        )}
      </div>

      <div className="card space-y-2">
        <p className="label">✍️ Your why</p>
        <textarea className="input" rows={3} defaultValue={quit.why} onBlur={(e) => e.target.value !== quit.why && save({ why: e.target.value })} />
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-500">Cost per week £</span>
          <input
            className="input w-24"
            type="number"
            min="0"
            defaultValue={quit.cost_per_week}
            onBlur={(e) => Number(e.target.value) !== Number(quit.cost_per_week) && save({ cost_per_week: Number(e.target.value) || 0 })}
          />
        </div>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="card text-center">
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-zinc-500">{label}</p>
    </div>
  );
}
