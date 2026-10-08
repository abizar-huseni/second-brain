"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { daysAgo, toDay } from "@/lib/dates";
import { goalProgress } from "@/lib/goals";
import { ENERGY, faceFor, MOOD, moodColor } from "@/lib/moods";
import Progress from "@/components/Progress";
import CoachCard from "@/components/CoachCard";
import InsightsCard from "@/components/InsightsCard";
import ResurfaceCard from "@/components/ResurfaceCard";
import QuitCard from "@/components/QuitCard";
import TodayPlan from "@/components/TodayPlan";
import NotifyButton from "@/components/NotifyButton";
import Confetti from "@/components/Confetti";
import type { Checkin, Goal, Habit, HabitLog } from "@/lib/types";
import type { HealthDay } from "@/lib/samsung";
import { timeAgo } from "@/lib/time";
import { skyFor } from "@/lib/feel";
import FuelCard from "@/components/FuelCard";
import { SleepTile } from "@/components/SleepPanel";

type Mail = { external_id: string; from_name: string; subject: string; category: string; unread: boolean; received_at: string };
type CalEvent = { external_id: string; title: string; starts_at: string; all_day: boolean; location: string | null };
type Sync = { source: string; last_ok: string | null; last_error: string | null };
type Data = { goals: Goal[]; habits: Habit[]; logs: HabitLog[]; checkins: Checkin[]; health: HealthDay | null; mail: Mail[]; events: CalEvent[]; sync: Sync[] };

const MAIL_ICON: Record<string, string> = { money: "💷", uni: "🎓", jobs: "💼", other: "✉️" };
const MAIL_RANK: Record<string, number> = { money: 0, uni: 1, jobs: 2, other: 3 };

export default function Today() {
  const [data, setData] = useState<Data | null>(null);
  const [party, setParty] = useState(false);
  const lastScore = useRef<number | null>(null);

  useEffect(() => {
    (async () => {
      const [g, h, l, c, hd, ib, ev, st] = await Promise.all([
        supabase.from("goals").select("*"),
        supabase.from("habits").select("*").eq("archived", false).order("created_at"),
        supabase.from("habit_logs").select("habit_id, day").eq("day", toDay()),
        supabase.from("checkins").select("*").gte("day", daysAgo(60)).order("day"),
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

  // Confetti the moment the day hits 100%.
  useEffect(() => {
    if (!data) return;
    const s = dayScore(data);
    if (lastScore.current !== null && lastScore.current < 100 && s === 100) {
      setParty(true);
      const t = setTimeout(() => setParty(false), 1800);
      lastScore.current = s;
      return () => clearTimeout(t);
    }
    lastScore.current = s;
  }, [data]);

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

  const score = dayScore(data);

  // Check-in streak: consecutive days with any check-in, counting from today (or yesterday if today is still open).
  const checked = new Set(data.checkins.map((c) => c.day));
  let streak = 0;
  for (let i = checked.has(today) ? 0 : 1; checked.has(daysAgo(i)); i++) streak++;

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
  const sky = skyFor(hour);
  const sleep = data.health?.sleep_min;
  const mail = [...data.mail].sort((a, b) => MAIL_RANK[a.category] - MAIL_RANK[b.category]).slice(0, 3);
  const live = [
    { source: "watch", icon: "⌚" },
    { source: "google", icon: "📧" },
    { source: "bank", icon: "🏦" },
  ].map((x) => ({ ...x, s: data.sync.find((y) => y.source === x.source) }));
  const nudge =
    score === 100
      ? "Perfect day. Earned it."
      : !morning && hour < 15
        ? "Start with a 10-second check-in."
        : !night && hour >= 19
          ? "Close the day: how did it go?"
          : score >= 50
            ? "Good momentum. Finish strong."
            : "Day's still yours. Start small.";

  return (
    <div className="stagger space-y-4">
      {party && <Confetti />}

      <section className={`relative overflow-hidden rounded-[32px] bg-gradient-to-br p-5 text-white shadow-xl ${SKY[sky]}`}>
        {sky === "night" && <Stars />}
        {sky === "dawn" && <div aria-hidden className="float absolute -right-6 -top-6 h-28 w-28 rounded-full bg-amber-200/40 blur-2xl" />}
        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-white/70">{now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</p>
            <h2 className="text-[28px] font-bold leading-tight tracking-tight">{greeting}</h2>
            <p className="mt-1 text-sm text-white/85">{nudge}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              {streak > 0 && <span className="rounded-full bg-white/15 px-2.5 py-1 backdrop-blur">🔥 {streak}-day streak</span>}
              <Link href="/me" className="flex items-center gap-2 rounded-full bg-white/10 px-2.5 py-1 text-white/80">
                {live.map((x) => (
                  <span key={x.source} className="flex items-center gap-1" title={x.s?.last_error ?? `Last sync ${timeAgo(x.s?.last_ok)}`}>
                    {x.icon}
                    <span className={`h-1.5 w-1.5 rounded-full ${x.s?.last_error ? "bg-amber-300" : x.s?.last_ok ? "bg-emerald-300" : "bg-white/30"}`} />
                  </span>
                ))}
              </Link>
            </div>
          </div>
          <Ring value={score} />
        </div>
        <div className="relative mt-4 grid grid-cols-2 gap-2">
          <CheckinPill label="Morning" icon="🌅" checkin={morning} />
          <CheckinPill label="Night" icon="🌙" checkin={night} />
        </div>
      </section>

      <QuitCard />
      <SleepTile />

      <p className="eyebrow">Now</p>
      <TodayPlan />

      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <p className="label mb-0">✅ Habits</p>
          <Link href="/habits" className="text-xs text-zinc-500">
            {goodDone}/{good.length} · Manage →
          </Link>
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
                  aria-pressed={on}
                  className={`chip flex items-center gap-1.5 ${on ? "accent-fill border-transparent font-medium text-white shadow-sm shadow-[var(--accent-glow)]" : ""}`}
                >
                  <span key={String(on)} className={on ? "pop inline-block" : "inline-block opacity-40"}>{on ? "✓" : "○"}</span>
                  {h.name}
                </button>
              );
            })}
          </div>
        )}
        {slips > 0 && <p className="text-xs text-rose-500">{slips} slip{slips > 1 ? "s" : ""} logged today. Reset, go again.</p>}
        {morning?.priorities && (
          <div className="rounded-2xl bg-zinc-500/5 p-3">
            <p className="label">🎯 Your top 3</p>
            <p className="whitespace-pre-line text-sm">{morning.priorities}</p>
          </div>
        )}
      </div>

      <p className="eyebrow">Your brain</p>
      <InsightsCard />
      <CoachCard />
      <FuelCard />
      <ResurfaceCard />
      <NotifyButton compact />

      {(data.events.length > 0 || mail.length > 0) && (
        <>
          <p className="eyebrow">Coming up</p>
          <div className="card space-y-3">
            {data.events.map((e) => (
              <div key={e.external_id} className="flex items-center gap-3 text-sm">
                <span className="flex h-10 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-zinc-500/10 text-[10px] leading-tight text-zinc-500">
                  <span className="font-semibold uppercase">{new Date(e.starts_at).toLocaleDateString("en-GB", { weekday: "short" })}</span>
                  {!e.all_day && <span className="tabular-nums">{new Date(e.starts_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>}
                </span>
                <span className="truncate font-medium">{e.title}</span>
              </div>
            ))}
            {mail.length > 0 && (
              <div className="space-y-1.5 border-t border-[var(--line)] pt-3 first:border-0 first:pt-0">
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
        </>
      )}

      <p className="eyebrow">Pulse</p>
      <div className="card space-y-4">
        <div className="grid grid-cols-4 gap-2 text-center">
          <Mini icon={faceFor(MOOD, lastMood?.value)?.emoji ?? "🙂"} value={faceFor(MOOD, lastMood?.value)?.label ?? "–"} label="Mood" />
          <Mini icon="😴" value={sleep ? `${Math.floor(sleep / 60)}h${String(sleep % 60).padStart(2, "0")}` : "–"} label="Sleep" href="/health" />
          <Mini icon="👟" value={data.health?.steps ? `${(data.health.steps / 1000).toFixed(1)}k` : "–"} label="Steps" href="/health" />
          <Mini icon="💼" value={`${hoursWeek.toFixed(hoursWeek % 1 ? 1 : 0)}h`} label="Worked 7d" />
        </div>
        <div>
          <p className="label">Mood, last 14 days</p>
          <div className="flex h-20 items-end gap-1">
            {mood.map((m, i) => (
              <div
                key={m.day}
                title={`${m.day}: ${m.value ? faceFor(MOOD, m.value)?.label : "no check-in"}`}
                className={`grow-bar flex-1 rounded-full ${m.value ? moodColor(m.value) : "bg-zinc-500/15"}`}
                style={{ height: `${m.value ? m.value * 10 : 6}%`, animationDelay: `${i * 30}ms` }}
              />
            ))}
          </div>
        </div>
        {data.health && <p className="text-center text-[11px] text-zinc-500">Watch data from {data.health.day === today ? "today" : data.health.day}</p>}
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
              <p className="mb-1 text-sm font-medium">{g.title}</p>
              <Progress value={d} max={max} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

const SKY = {
  dawn: "from-amber-400 via-orange-500 to-rose-500 shadow-orange-500/20",
  day: "from-emerald-500 via-teal-500 to-cyan-600 shadow-teal-500/20",
  dusk: "from-indigo-500 via-violet-600 to-fuchsia-600 shadow-violet-500/25",
  night: "from-slate-900 via-indigo-950 to-violet-950 shadow-indigo-950/30",
};

// Day score: both check-ins plus every good habit.
function dayScore(d: Data) {
  const today = toDay();
  const good = d.habits.filter((h) => h.kind === "good");
  const done = good.filter((h) => d.logs.some((l) => l.habit_id === h.id)).length;
  const checks = ["morning", "night"].filter((k) => d.checkins.some((c) => c.day === today && c.kind === k)).length;
  return Math.round(((checks + done) / (2 + good.length)) * 100);
}

function Stars() {
  return (
    <div aria-hidden className="absolute inset-0">
      {Array.from({ length: 18 }, (_, i) => (
        <span
          key={i}
          className="twinkle absolute h-0.5 w-0.5 rounded-full bg-white"
          style={{ left: `${(i * 53) % 100}%`, top: `${(i * 37) % 100}%`, animationDelay: `${(i % 6) * 0.5}s` }}
        />
      ))}
    </div>
  );
}

function Ring({ value }: { value: number }) {
  const shown = useCountUp(value);
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90">
        <circle cx="36" cy="36" r={r} fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="7" />
        <circle
          cx="36"
          cy="36"
          r={r}
          fill="none"
          stroke="white"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown / 100)}
          style={{ filter: "drop-shadow(0 0 4px rgb(255 255 255 / 0.6))" }}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center text-xl font-bold tabular-nums">
        {Math.round(shown)}%<span className="text-[9px] font-medium uppercase tracking-wider text-white/70">today</span>
      </span>
    </div>
  );
}

// Eases a number up from where it was (0 on first load).
function useCountUp(target: number, ms = 900) {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const val = a + (target - a) * (1 - Math.pow(1 - k, 3));
      setV(val);
      from.current = val;
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

function CheckinPill({ label, icon, checkin }: { label: string; icon: string; checkin?: Checkin }) {
  const m = faceFor(MOOD, checkin?.mood);
  const e = faceFor(ENERGY, checkin?.energy);
  return (
    <Link
      href="/checkin"
      className={`flex items-center justify-between rounded-2xl px-3 py-2.5 text-sm transition active:scale-95 ${checkin ? "bg-white/20" : "bg-white text-zinc-900 shadow-md"}`}
    >
      <span className="font-medium">
        {icon} {label}
      </span>
      {checkin ? (
        <span className="text-lg leading-none">
          {m?.emoji ?? "✓"}
          {e?.emoji}
        </span>
      ) : (
        <span className="text-xs font-semibold text-zinc-500">Check in →</span>
      )}
    </Link>
  );
}

function Mini({ value, label, icon, href }: { value: string; label: string; icon: string; href?: string }) {
  const body = (
    <>
      <p className="text-xl leading-none">{icon}</p>
      <p className="mt-1.5 truncate text-sm font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] text-zinc-500">{label}</p>
    </>
  );
  return href ? (
    <Link href={href} className="rounded-2xl py-1 transition active:scale-95">
      {body}
    </Link>
  ) : (
    <div className="py-1">{body}</div>
  );
}
