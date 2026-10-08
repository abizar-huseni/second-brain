"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { daysAgo, streak, toDay } from "@/lib/dates";
import type { Habit, HabitLog } from "@/lib/types";

// select("*") also returns created_at, used to start a Break streak on the day the habit was added.
type Row = Habit & { created_at?: string };

export default function HabitsPage() {
  const [habits, setHabits] = useState<Row[]>([]);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Habit["kind"]>("good");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const req = useRef(0);

  const load = useCallback(async () => {
    const id = ++req.current;
    const h = await supabase.from("habits").select("*").eq("archived", false).order("created_at");
    const ids = (h.data ?? []).map((x) => x.id);
    // Only active habits, newest first, a page of 1000 at a time (the server caps each answer at 1000 rows).
    const all: HabitLog[] = [];
    for (let from = 0; ids.length > 0; from += 1000) {
      const { data, error } = await supabase
        .from("habit_logs")
        .select("habit_id, day")
        .in("habit_id", ids)
        .gte("day", daysAgo(365))
        .order("day", { ascending: false })
        .order("habit_id")
        .range(from, from + 999);
      if (error || !data) break;
      all.push(...data);
      if (data.length < 1000) break;
    }
    // Two quick ticks start two loads; an older one finishing last must not undo the newer tick on screen.
    if (id !== req.current) return;
    setHabits(h.data ?? []);
    setLogs(all);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    if (busy.current || !name.trim()) return;
    busy.current = true;
    setSaving(true);
    const { error } = await supabase.from("habits").insert({ name: name.trim(), kind });
    busy.current = false;
    setSaving(false);
    if (error) return setMsg(error.message);
    setMsg("");
    setName("");
    load();
  }

  async function toggle(habit: Habit, day: string) {
    const has = logs.some((l) => l.habit_id === habit.id && l.day === day);
    // Upsert so a tick the page didn't know about can't fail on the duplicate.
    const { error } = has
      ? await supabase.from("habit_logs").delete().eq("habit_id", habit.id).eq("day", day)
      : await supabase.from("habit_logs").upsert({ habit_id: habit.id, day }, { onConflict: "habit_id,day", ignoreDuplicates: true });
    setMsg(error ? error.message : "");
    load();
  }

  async function archive(habit: Habit) {
    if (!confirm(`Stop tracking "${habit.name}"?`)) return;
    await supabase.from("habits").update({ archived: true }).eq("id", habit.id);
    load();
  }

  const week = Array.from({ length: 7 }, (_, i) => daysAgo(6 - i));

  return (
    <div className="space-y-6">
      {(["good", "bad"] as const).map((k) => (
        <section key={k} className="space-y-2">
          <h2 className="font-semibold">{k === "good" ? "Build" : "Break"}</h2>
          <p className="text-xs text-zinc-500">
            {k === "good" ? "Tick the days you did it." : "Tick the days you slipped. Streak = clean days."}
          </p>
          {habits.filter((h) => h.kind === k).map((h) => {
            const days = new Set(logs.filter((l) => l.habit_id === h.id).map((l) => l.day));
            return (
              <div key={h.id} className="card">
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-medium">{h.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-zinc-500">🔥 {streak(days, h.kind, h.created_at)}</span>
                    <button onClick={() => archive(h)} className="text-xs text-zinc-400" aria-label={`Stop tracking ${h.name}`}>✕</button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {week.map((d) => {
                    const on = days.has(d);
                    const color = k === "good" ? "bg-emerald-500 text-white" : "bg-rose-500 text-white";
                    return (
                      <button
                        key={d}
                        onClick={() => toggle(h, d)}
                        aria-pressed={on}
                        aria-label={`${h.name}, ${new Date(d + "T12:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}`}
                        className={`rounded-md py-2 text-xs ${on ? color : "bg-zinc-100 dark:bg-zinc-800"} ${
                          d === toDay() ? "ring-2 ring-zinc-400" : ""
                        }`}
                      >
                        {new Date(d + "T12:00").toLocaleDateString("en-GB", { weekday: "narrow" })}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      ))}

      {msg && <p className="notice">{msg}</p>}
      <div className="card flex flex-col gap-2 sm:flex-row">
        <input className="input" placeholder="New habit" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <select className="input sm:w-32" value={kind} onChange={(e) => setKind(e.target.value as Habit["kind"])}>
          <option value="good">Build</option>
          <option value="bad">Break</option>
        </select>
        <button className="btn" disabled={saving} onClick={add}>Add</button>
      </div>
    </div>
  );
}
