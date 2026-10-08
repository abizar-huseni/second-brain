"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { daysAgo, toDay } from "@/lib/dates";
import { goalProgress } from "@/lib/goals";
import Progress from "@/components/Progress";
import type { Checkin, Goal, Habit, HabitLog } from "@/lib/types";
import type { HealthDay } from "@/lib/samsung";

type Data = { goals: Goal[]; habits: Habit[]; logs: HabitLog[]; checkins: Checkin[]; health: HealthDay | null };

export default function Today() {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    (async () => {
      const [g, h, l, c, hd] = await Promise.all([
        supabase.from("goals").select("*"),
        supabase.from("habits").select("*").eq("archived", false),
        supabase.from("habit_logs").select("habit_id, day").eq("day", toDay()),
        supabase.from("checkins").select("*").gte("day", daysAgo(13)).order("day"),
        supabase.from("health_days").select("*").order("day", { ascending: false }).limit(1),
      ]);
      setData({ goals: g.data ?? [], habits: h.data ?? [], logs: l.data ?? [], checkins: c.data ?? [], health: hd.data?.[0] ?? null });
    })();
  }, []);

  if (!data) return <p className="text-zinc-500">Loading…</p>;

  const today = toDay();
  const morning = data.checkins.find((c) => c.day === today && c.kind === "morning");
  const night = data.checkins.find((c) => c.day === today && c.kind === "night");
  const good = data.habits.filter((h) => h.kind === "good");
  const goodDone = good.filter((h) => data.logs.some((l) => l.habit_id === h.id)).length;
  const slips = data.habits.filter((h) => h.kind === "bad" && data.logs.some((l) => l.habit_id === h.id)).length;
  const hoursWeek = data.checkins.filter((c) => c.day >= daysAgo(6)).reduce((sum, c) => sum + Number(c.hours_worked ?? 0), 0);
  const big = data.goals.filter((g) => !g.parent_id);

  // Average mood per day for the last 14 days.
  const mood = Array.from({ length: 14 }, (_, i) => {
    const day = daysAgo(13 - i);
    const vals = data.checkins.filter((c) => c.day === day && c.mood).map((c) => c.mood as number);
    return { day, value: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null };
  });

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{greeting}</h1>

      <div className="grid grid-cols-2 gap-3">
        <CheckinTile label="Morning" done={!!morning} />
        <CheckinTile label="Night" done={!!night} />
      </div>

      {morning?.priorities && (
        <div className="card">
          <p className="label">Today&apos;s top 3</p>
          <p className="whitespace-pre-line text-sm">{morning.priorities}</p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Habits" value={`${goodDone}/${good.length}`} />
        <Stat label="Slips" value={String(slips)} />
        <Stat label="Hours (7d)" value={hoursWeek.toFixed(1)} />
      </div>

      {data.health && (
        <Link href="/health" className="grid grid-cols-3 gap-3">
          <Stat label={`Steps (${data.health.day.slice(5)})`} value={data.health.steps?.toLocaleString("en-GB") ?? "–"} />
          <Stat label="Sleep" value={data.health.sleep_min ? `${Math.floor(data.health.sleep_min / 60)}h ${data.health.sleep_min % 60}m` : "–"} />
          <Stat label="Stress" value={data.health.stress_avg?.toString() ?? "–"} />
        </Link>
      )}

      <div className="card">
        <p className="label">Mood, last 14 days</p>
        <div className="flex h-24 items-end gap-1">
          {mood.map((m) => (
            <div
              key={m.day}
              title={`${m.day}: ${m.value?.toFixed(1) ?? "no check-in"}`}
              className={`flex-1 rounded-t ${m.value ? "bg-emerald-500" : "bg-zinc-200 dark:bg-zinc-800"}`}
              style={{ height: `${m.value ? m.value * 10 : 4}%` }}
            />
          ))}
        </div>
      </div>

      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <p className="label mb-0">Goals</p>
          <Link href="/goals" className="text-xs text-zinc-500">All →</Link>
        </div>
        {big.length === 0 && <p className="text-sm text-zinc-500">No goals yet. Add your first one.</p>}
        {big.map((g) => {
          const [done, max] = goalProgress(g, data.goals.filter((s) => s.parent_id === g.id));
          return (
            <div key={g.id}>
              <p className="mb-1 text-sm">{g.title}</p>
              <Progress value={done} max={max} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CheckinTile({ label, done }: { label: string; done: boolean }) {
  return (
    <Link href="/checkin" className={`card text-center ${done ? "border-emerald-500" : ""}`}>
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="text-lg font-semibold">{done ? "✓ Done" : "Not yet"}</p>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card text-center">
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-zinc-500">{label}</p>
    </div>
  );
}
