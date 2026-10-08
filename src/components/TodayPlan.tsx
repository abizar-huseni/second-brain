"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { toDay } from "@/lib/dates";
import type { DayPlan } from "@/lib/plan";

type Task = { id: string; title: string; must: boolean; done: boolean; day: string | null };

// Today's non-negotiables (from the plan made last night) and your own tasks, tickable here.
export default function TodayPlan({ onChange }: { onChange?: (open: number, total: number) => void }) {
  const today = toDay();
  const [plan, setPlan] = useState<DayPlan | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);

  const load = useCallback(async () => {
    const [p, t] = await Promise.all([
      supabase.from("plans").select("content").eq("kind", "day").eq("period", today).maybeSingle(),
      supabase.from("tasks").select("*").or(`day.eq.${today},and(day.lt.${today},done.eq.false)`).order("must", { ascending: false }).order("created_at"),
    ]);
    setPlan((p.data?.content as DayPlan) ?? null);
    setTasks(t.error ? [] : (t.data ?? []));
  }, [today]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (tasks) onChange?.(tasks.filter((t) => !t.done).length, tasks.length);
  }, [tasks, onChange]);

  async function toggle(t: Task) {
    setTasks((xs) => xs?.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)) ?? null);
    await supabase.from("tasks").update({ done: !t.done, done_at: t.done ? null : new Date().toISOString() }).eq("id", t.id);
  }
  async function adopt(title: string) {
    await supabase.from("tasks").insert({ title, day: today, must: true, source: "ai" });
    load();
  }

  if (tasks === null) return <div className="skeleton h-24" />;
  const missing = (plan?.non_negotiables ?? []).filter((n) => !tasks.some((t) => t.title === n.title));
  if (!plan && !tasks.length) {
    return (
      <Link href="/plan" className="card card-link flex items-center gap-3">
        <span className="text-2xl">📋</span>
        <span className="flex-1 text-sm">
          <span className="block font-medium">Nothing planned for today</span>
          <span className="text-xs text-zinc-500">Add a task with + or let your brain plan the day.</span>
        </span>
        <span className="text-xs text-zinc-500">Plan →</span>
      </Link>
    );
  }

  return (
    <div className="card space-y-2">
      <div className="flex items-center justify-between">
        <p className="label mb-0">🎯 Today</p>
        <Link href="/plan" className="text-xs text-zinc-500">
          Plan →
        </Link>
      </div>
      {plan?.headline && <p className="text-sm font-medium">{plan.headline}</p>}
      <ul className="space-y-1">
        {tasks.map((t) => (
          <li key={t.id} className="flex items-center gap-3 py-1">
            <button
              onClick={() => toggle(t)}
              aria-label={t.done ? "Mark not done" : "Mark done"}
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs text-white transition ${t.done ? "border-emerald-500 bg-emerald-500" : t.must ? "border-rose-400" : "border-zinc-300 dark:border-zinc-600"}`}
            >
              {t.done && <span className="pop">✓</span>}
            </button>
            <span className={`text-sm ${t.done ? "text-zinc-400 line-through" : ""}`}>
              {t.must && !t.done && "⭐ "}
              {t.title}
              {t.day && t.day < today && !t.done && <span className="ml-1 text-xs text-rose-500">overdue</span>}
            </span>
          </li>
        ))}
        {missing.map((n) => (
          <li key={n.title} className="flex items-center gap-3 py-1">
            <button onClick={() => adopt(n.title)} aria-label="Add to my tasks" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-rose-300 text-xs text-rose-400">
              +
            </button>
            <span className="text-sm text-zinc-500">
              {n.title} <span className="text-[10px]">non-negotiable</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
