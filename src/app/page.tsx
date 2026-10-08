"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { daysAgo, toDay } from "@/lib/dates";
import { goalProgress } from "@/lib/goals";
import { ENERGY, faceFor, MOOD, moodColor } from "@/lib/moods";
import Progress from "@/components/Progress";
import CoachCard from "@/components/CoachCard";
import type { Checkin, Goal, Habit, HabitLog } from "@/lib/types";
import type { HealthDay } from "@/lib/samsung";

type Data = { goals: Goal[]; habits: Habit[]; logs: HabitLog[]; checkins: Checkin[]; health: HealthDay | null };

export default function Today() {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    (async () => {
      const [g, h, l, c, hd] = await Promise.all([
        supabase.from("goals").select("*"),
        supabase.from("habits").select("*").eq("archived", false).order("created_at"),
        supabase.from("habit_logs").select("habit_id, day").eq("day", toDay()),
        supabase.from("checkins").select("*").gte("day", daysAgo(13)).order("day"),
        supabase.from("health_days").select("*").order("day", { ascending: false }).limit(1),
      ]);
      setData({ goals: g.data ?? [], habits: h.data ?? [], logs: l.data ?? [], checkins: c.data ?? [], health: hd.data?.[0] ?? null });
    })();
  }, []);

  if (!data) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-28" />
        <div className="skeleton h-48" />
        <div className="skeleton h-24" />
      </div>
    );
  }

  const today = toDay();
  const morning = data.checkins.find((c) => c.day === today && c.kind === "morning");
  const night = data.checkins.find((c) => c.day === today && c.kind === "night");
  const good = data.habits.filter((h) => h.kind === "good");
  const done = (h: Habit) => data.logs.some((l) => l.habit_id === h.id);
  const goodDone = good.filter(done).length;
  const slips = data.habits.filter((h) => h.kind === "bad" && done(h)).length;
  const hoursWeek = data.checkins.filter((c) => c.day >= daysAgo(6)).reduce((sum, c) => sum + Number(c.hours_worked ?? 0), 0);
  const big = data.goals.filter((g) => !g.parent_id);

  // Day score: both check-ins plus every good habit.
  const total = 2 + good.length;
  const score = Math.round((((morning ? 1 : 0) + (night ? 1 : 0) + goodDone) / total) * 100);

  async function toggle(h: Habit) {
    const has = done(h);
    setData((d) => d && { ...d, logs: has ? d.logs.filter((l) => l.habit_id !== h.id) : [...d.logs, { habit_id: h.id, day: today }] });
    if (has) await supabase.from("habit_logs").delete().eq("habit_id", h.id).eq("day", today);
    else await supabase.from("habit_logs").insert({ habit_id: h.id, day: today });
  }

  const mood = Array.from({ length: 14 }, (_, i) => {
    const day = daysAgo(13 - i);
    const vals = data.checkins.filter((c) => c.day === day && c.mood).map((c) => c.mood as number);
    return { day, value: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null };
  });
  const lastMood = [...mood].reverse().find((m) => m.value !== null);

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 5 ? "Still up?" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const sleep = data.health?.sleep_min;

  return (
    <div className="stagger space-y-4">
      <div className="card flex items-center justify-between gap-4 bg-gradient-to-br from-zinc-900 to-zinc-700 text-white dark:from-emerald-900 dark:to-zinc-900">
        <div>
          <p className="text-sm text-white/70">{now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="text-2xl font-semibold">{greeting}</h1>
          <p className="mt-1 text-sm text-white/80">{score === 100 ? "Perfect day. Earned it." : score >= 50 ? "Good momentum. Finish strong." : "Day's still yours. Start small."}</p>
        </div>
        <Ring value={score} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <CheckinTile label="Morning" icon="🌅" checkin={morning} />
        <CheckinTile label="Night" icon="🌙" checkin={night} />
      </div>

      <CoachCard />

      {morning?.priorities && (
        <div className="card">
          <p className="label">🎯 Today&apos;s top 3</p>
          <p className="whitespace-pre-line text-sm">{morning.priorities}</p>
        </div>
      )}

      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <p className="label mb-0">✅ Habits today</p>
          <Link href="/habits" className="text-xs text-zinc-500">Manage →</Link>
        </div>
        {good.length === 0 ? (
          <Link href="/habits" className="text-sm text-zinc-500">Add the habits you want to build →</Link>
        ) : (
          <div className="flex flex-wrap gap-2">
            {good.map((h) => {
              const on = done(h);
              return (
                <button
                  key={h.id}
                  onClick={() => toggle(h)}
                  className={`chip ${on ? "border-emerald-500 bg-emerald-500 text-white" : ""}`}
                >
                  <span key={String(on)} className={on ? "pop mr-1 inline-block" : "mr-1 inline-block"}>{on ? "✓" : "○"}</span>
                  {h.name}
                </button>
              );
            })}
          </div>
        )}
        <div className="grid grid-cols-3 gap-2 text-center">
          <Mini value={`${goodDone}/${good.length}`} label="Built" />
          <Mini value={String(slips)} label="Slips" warn={slips > 0} />
          <Mini value={`${hoursWeek.toFixed(1)}h`} label="Worked (7d)" />
        </div>
      </div>

      {data.health && (
        <Link href="/health" className="card card-link grid grid-cols-3 gap-2 text-center">
          <Mini icon="👟" value={data.health.steps?.toLocaleString("en-GB") ?? "–"} label="Steps" />
          <Mini icon="😴" value={sleep ? `${Math.floor(sleep / 60)}h ${sleep % 60}m` : "–"} label="Sleep" />
          <Mini icon="❤️" value={data.health.hr_min ? `${data.health.hr_min}` : "–"} label="Resting HR" />
          <p className="col-span-3 text-xs text-zinc-500">From your watch, {data.health.day === today ? "today" : data.health.day}</p>
        </Link>
      )}

      <div className="card">
        <div className="mb-2 flex items-baseline justify-between">
          <p className="label mb-0">Mood, last 14 days</p>
          {lastMood?.value && <span className="text-2xl">{faceFor(MOOD, lastMood.value)?.emoji}</span>}
        </div>
        <div className="flex h-24 items-end gap-1">
          {mood.map((m) => (
            <div
              key={m.day}
              title={`${m.day}: ${m.value ? faceFor(MOOD, m.value)?.label : "no check-in"}`}
              className={`flex-1 rounded-t-md transition-all duration-700 ${m.value ? moodColor(m.value) : "bg-zinc-200 dark:bg-zinc-800"}`}
              style={{ height: `${m.value ? m.value * 10 : 4}%` }}
            />
          ))}
        </div>
      </div>

      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <p className="label mb-0">🏔️ Goals</p>
          <Link href="/goals" className="text-xs text-zinc-500">All →</Link>
        </div>
        {big.length === 0 && <Link href="/goals" className="text-sm text-zinc-500">Set your first goal →</Link>}
        {big.map((g) => {
          const [d, max] = goalProgress(g, data.goals.filter((s) => s.parent_id === g.id));
          return (
            <div key={g.id}>
              <p className="mb-1 text-sm">{g.title}</p>
              <Progress value={d} max={max} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Ring({ value }: { value: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-20 w-20 shrink-0">
      <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90">
        <circle cx="36" cy="36" r={r} fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="7" />
        <circle
          cx="36"
          cy="36"
          r={r}
          fill="none"
          stroke="#34d399"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value / 100)}
          className="transition-all duration-1000"
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center text-lg font-semibold tabular-nums">
        {value}%<span className="text-[9px] font-normal uppercase tracking-wide text-white/60">today</span>
      </span>
    </div>
  );
}

function CheckinTile({ label, icon, checkin }: { label: string; icon: string; checkin?: Checkin }) {
  const m = faceFor(MOOD, checkin?.mood);
  const e = faceFor(ENERGY, checkin?.energy);
  return (
    <Link href="/checkin" className={`card card-link text-center ${checkin ? "border-emerald-400 dark:border-emerald-600" : ""}`}>
      <p className="text-sm text-zinc-500">
        {icon} {label}
      </p>
      {checkin ? (
        <p className="mt-1 text-2xl">
          {m?.emoji ?? "✓"}
          {e?.emoji}
        </p>
      ) : (
        <p className="mt-1 text-sm font-semibold text-emerald-700 dark:text-emerald-400">Check in →</p>
      )}
    </Link>
  );
}

function Mini({ value, label, icon, warn }: { value: string; label: string; icon?: string; warn?: boolean }) {
  return (
    <div>
      {icon && <p className="text-lg">{icon}</p>}
      <p className={`text-lg font-semibold tabular-nums ${warn ? "text-rose-500" : ""}`}>{value}</p>
      <p className="text-xs text-zinc-500">{label}</p>
    </div>
  );
}
