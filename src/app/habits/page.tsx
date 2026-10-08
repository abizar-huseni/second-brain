"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { daysAgo, streak, toDay } from "@/lib/dates";
import type { Habit, HabitLog } from "@/lib/types";

export default function HabitsPage() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Habit["kind"]>("good");

  const load = useCallback(async () => {
    const [h, l] = await Promise.all([
      supabase.from("habits").select("*").eq("archived", false).order("created_at"),
      supabase.from("habit_logs").select("habit_id, day").gte("day", daysAgo(365)),
    ]);
    setHabits(h.data ?? []);
    setLogs(l.data ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    if (!name.trim()) return;
    await supabase.from("habits").insert({ name: name.trim(), kind });
    setName("");
    load();
  }

  async function toggle(habit: Habit, day: string) {
    const has = logs.some((l) => l.habit_id === habit.id && l.day === day);
    if (has) await supabase.from("habit_logs").delete().eq("habit_id", habit.id).eq("day", day);
    else await supabase.from("habit_logs").insert({ habit_id: habit.id, day });
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
                    <span className="text-sm text-zinc-500">🔥 {streak(days, h.kind)}</span>
                    <button onClick={() => archive(h)} className="text-xs text-zinc-400">✕</button>
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

      <div className="card flex flex-col gap-2 sm:flex-row">
        <input className="input" placeholder="New habit" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <select className="input sm:w-32" value={kind} onChange={(e) => setKind(e.target.value as Habit["kind"])}>
          <option value="good">Build</option>
          <option value="bad">Break</option>
        </select>
        <button className="btn" onClick={add}>Add</button>
      </div>
    </div>
  );
}
