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
import { timeAgo } from "@/lib/time";

type Mail = { external_id: string; from_name: string; subject: string; category: string; unread: boolean; received_at: string };
type CalEvent = { external_id: string; title: string; starts_at: string; all_day: boolean; location: string | null };
type Sync = { source: string; last_ok: string | null; last_error: string | null };
type Data = { goals: Goal[]; habits: Habit[]; logs: HabitLog[]; checkins: Checkin[]; health: HealthDay | null; mail: Mail[]; events: CalEvent[]; sync: Sync[] };

const MAIL_ICON: Record<string, string> = { money: "💷", uni: "🎓", jobs: "💼", other: "✉️" };
const MAIL_RANK: Record<string, number> = { money: 0, uni: 1, jobs: 2, other: 3 };

export default function Today() {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    (async () => {
      const [g, h, l, c, hd, ib, ev, st] = await Promise.all([
        supabase.from("goals").select("*"),
        supabase.from("habits").select("*").eq("archived", false).order("created_at"),
        supabase.from("habit_logs").select("habit_id, day").eq("day", toDay()),
        supabase.from("checkins").select("*").gte("day", daysAgo(13)).order("day"),
        supabase.from("health_days").select("*").order("day", { ascending: false }).limit(1),
        supabase.from("inbox").select("*").eq("unread", true).gte("received_at", new Date(Date.now() - 2 * 86400000).toISOString()).order("received_at", { ascending: false }).limit(30),
        supabase.from("events").select("*").gte("starts_at", new Date(Date.now() - 3600000).toISOString()).lte("starts_at", new Date(Date.now() + 2 * 86400000).toISOString()).order("starts_at").limit(4),
        supabase.from("sync_status").select("source, last_ok, last_error"),
      ]);
      setData({
        goals: g.data ?? [],
        habits: h.data ?? [],
        logs: l.data ?? [],
        checkins: c.data ?? [],
        health: hd.data?.[0] ?? null,
        mail: ib.data ?? [],
        events: ev.data ?? [],
        sync: st.data ?? [],
      });
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
  const mail = [...data.mail].sort((a, b) => MAIL_RANK[a.category] - MAIL_RANK[b.category]).slice(0, 3);
  const live = [
    { source: "watch", icon: "⌚" },
    { source: "google", icon: "📧" },
    { source: "bank", icon: "🏦" },
  ].map((x) => ({ ...x, s: data.sync.find((y) => y.source === x.source) }));

  return (
    <div className="stagger space-y-4">
      <div className="card flex items-center justify-between gap-4 bg-gradient-to-br from-zinc-900 to-zinc-700 text-white dark:from-emerald-900 dark:to-zinc-900">
        <div>
          <p className="text-sm text-white/70">{now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="text-2xl font-semibold">{greeting}</h1>
          <p className="mt-1 text-sm text-white/80">{score === 100 ? "Perfect day. Earned it." : score >= 50 ? "Good momentum. Finish strong." : "Day's still yours. Start small."}</p>
          <Link href="/me" className="mt-2 flex gap-2 text-xs text-white/70">
            {live.map((x) => (
              <span key={x.source} className="flex items-center gap-1" title={x.s?.last_error ?? `Last sync ${timeAgo(x.s?.last_ok)}`}>
                {x.icon}
                <span className={`h-1.5 w-1.5 rounded-full ${x.s?.last_error ? "bg-amber-400" : x.s?.last_ok ? "bg-emerald-400" : "bg-white/30"}`} />
              </span>
            ))}
          </Link>
        </div>
        <Ring value={score} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <CheckinTile label="Morning" icon="🌅" checkin={morning} />
        <CheckinTile label="Night" icon="🌙" checkin={night} />
      </div>

      <CoachCard />

      {(data.events.length > 0 || mail.length > 0) && (
        <div className="card space-y-3">
          {data.events.length > 0 && (
            <div className="space-y-1.5">
              <p className="label">📅 Next up</p>
              {data.events.map((e) => (
                <div key={e.external_id} className="flex gap-3 text-sm">
                  <span className="w-20 shrink-0 tabular-nums text-zinc-500">
                    {new Date(e.starts_at).toLocaleString("en-GB", e.all_day ? { weekday: "short" } : { weekday: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="truncate">{e.title}</span>
                </div>
              ))}
            </div>
          )}
          {mail.length > 0 && (
            <div className="space-y-1.5">
              <p className="label">📬 Unread ({data.mail.length})</p>
              {mail.map((m) => (
                <div key={m.external_id} className="flex gap-2 text-sm">
                  <span>{MAIL_ICON[m.category] ?? "✉️"}</span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{m.from_name}</span> <span className="text-zinc-500">{m.subject}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
