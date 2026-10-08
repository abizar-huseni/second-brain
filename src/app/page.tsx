"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { daysAgo, toDay } from "@/lib/dates";
import { ENERGY, faceFor, MOOD } from "@/lib/moods";
import BrainHero from "@/components/BrainHero";
import InsightsCard from "@/components/InsightsCard";
import ResurfaceCard from "@/components/ResurfaceCard";
import QuitCard from "@/components/QuitCard";
import TodayPlan from "@/components/TodayPlan";
import FuelCard from "@/components/FuelCard";
import { SleepTile } from "@/components/SleepPanel";
import { Approvals } from "@/components/LaptopCard";
import Confetti from "@/components/Confetti";
import type { Checkin, Habit, HabitLog } from "@/lib/types";
import { success, tap } from "@/lib/haptics";

type Mail = { external_id: string; from_name: string; subject: string; category: string; unread: boolean; received_at: string };
type CalEvent = { external_id: string; title: string; starts_at: string; all_day: boolean; location: string | null };
type Data = { habits: Habit[]; logs: HabitLog[]; checkins: Checkin[]; mail: Mail[]; events: CalEvent[] };

const MAIL_ICON: Record<string, string> = { money: "💷", uni: "🎓", jobs: "💼", other: "✉️" };

// Today: one calm column. The assistant's read of your day first, then only what needs you today.
export default function Today() {
  const [data, setData] = useState<Data | null>(null);
  const [party, setParty] = useState(false);
  const lastScore = useRef<number | null>(null);

  useEffect(() => {
    (async () => {
      const [h, l, c, ib, ev] = await Promise.all([
        supabase.from("habits").select("*").eq("archived", false).order("created_at"),
        supabase.from("habit_logs").select("habit_id, day").eq("day", toDay()),
        supabase.from("checkins").select("*").gte("day", daysAgo(60)).order("day"),
        // Only mail that matters (money and uni), unread, last 2 days.
        supabase.from("inbox").select("*").eq("unread", true).in("category", ["money", "uni"]).gte("received_at", new Date(Date.now() - 2 * 86400000).toISOString()).order("received_at", { ascending: false }).limit(3),
        supabase.from("events").select("*").gte("starts_at", new Date(Date.now() - 3600000).toISOString()).lte("starts_at", new Date(Date.now() + 36 * 3600000).toISOString()).order("starts_at").limit(3),
      ]);
      setData({ habits: h.data ?? [], logs: l.data ?? [], checkins: c.data ?? [], mail: ib.data ?? [], events: ev.data ?? [] });
    })();
  }, []);

  // Confetti the moment the day hits 100%.
  useEffect(() => {
    if (!data) return;
    const s = dayScore(data);
    if (lastScore.current !== null && lastScore.current < 100 && s === 100) {
      setParty(true);
      success();
      const t = setTimeout(() => setParty(false), 1800);
      lastScore.current = s;
      return () => clearTimeout(t);
    }
    lastScore.current = s;
  }, [data]);

  const score = data ? dayScore(data) : 0;

  return (
    <div className="stagger space-y-4">
      {party && <Confetti />}
      <BrainHero score={score} />
      {data ? <DayStrip data={data} score={score} /> : <div className="skeleton h-24 rounded-[1.35rem]" />}
      <TodayPlan />
      <Approvals />
      <InsightsCard />
      <div className="grid grid-cols-2 gap-3">
        <SleepTile />
        <QuitCard compact />
      </div>
      <FuelCard />
      {data && <Habits data={data} setData={setData} />}
      <ResurfaceCard />
      {data && (data.events.length > 0 || data.mail.length > 0) && <NextUp data={data} />}
    </div>
  );
}

// Day score: both check-ins plus every good habit.
function dayScore(d: Data) {
  const today = toDay();
  const good = d.habits.filter((h) => h.kind === "good");
  const done = good.filter((h) => d.logs.some((l) => l.habit_id === h.id)).length;
  const checks = ["morning", "night"].filter((k) => d.checkins.some((c) => c.day === today && c.kind === k)).length;
  return Math.round(((checks + done) / (2 + good.length)) * 100);
}

function DayStrip({ data, score }: { data: Data; score: number }) {
  const today = toDay();
  const morning = data.checkins.find((c) => c.day === today && c.kind === "morning");
  const night = data.checkins.find((c) => c.day === today && c.kind === "night");
  const checked = new Set(data.checkins.map((c) => c.day));
  let streak = 0;
  for (let i = checked.has(today) ? 0 : 1; checked.has(daysAgo(i)); i++) streak++;
  const hour = new Date().getHours();

  return (
    <div className="card flex items-center gap-4">
      <Ring value={score} />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm font-medium">
          {score === 100 ? "Perfect day. Earned it." : score >= 50 ? "Good momentum. Finish strong." : "The day's still yours. Start small."}
          {streak > 1 && <span className="ml-1.5 whitespace-nowrap text-xs muted">🔥 {streak}-day streak</span>}
        </p>
        <div className="flex gap-2">
          <CheckinPill label="Morning" icon="🌅" checkin={morning} nudge={!morning && hour < 14} />
          <CheckinPill label="Night" icon="🌙" checkin={night} nudge={!night && hour >= 20} />
        </div>
      </div>
    </div>
  );
}

function CheckinPill({ label, icon, checkin, nudge }: { label: string; icon: string; checkin?: Checkin; nudge: boolean }) {
  const m = faceFor(MOOD, checkin?.mood);
  const e = faceFor(ENERGY, checkin?.energy);
  return (
    <Link
      href="/checkin"
      onClick={() => tap()}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-2xl border px-3 py-2 text-sm transition active:scale-95 ${checkin ? "border-emerald-400/40 bg-emerald-400/10" : nudge ? "border-emerald-400/60 font-semibold" : ""}`}
      style={checkin || nudge ? undefined : { borderColor: "var(--border)" }}
    >
      <span>{icon}</span>
      {checkin ? (
        <span className="text-base leading-none">
          {m?.emoji ?? "✓"}
          {e?.emoji}
        </span>
      ) : (
        <span className={nudge ? "text-emerald-600 dark:text-emerald-300" : "muted"}>{label}</span>
      )}
    </Link>
  );
}

function Ring({ value }: { value: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setV(value), 120);
    return () => clearTimeout(t);
  }, [value]);
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-[76px] w-[76px] shrink-0">
      <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90">
        <circle cx="36" cy="36" r={r} fill="none" stroke="currentColor" strokeOpacity="0.1" strokeWidth="7" />
        <circle cx="36" cy="36" r={r} fill="none" stroke="url(#dayRing)" strokeWidth="7" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} className="ring-draw" />
        <defs>
          <linearGradient id="dayRing" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#34d399" />
            <stop offset="1" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center text-lg font-semibold num">
        {value}%<span className="text-[9px] font-medium uppercase tracking-wider muted">today</span>
      </span>
    </div>
  );
}

function Habits({ data, setData }: { data: Data; setData: React.Dispatch<React.SetStateAction<Data | null>> }) {
  const today = toDay();
  const good = data.habits.filter((h) => h.kind === "good");
  const done = (h: Habit) => data.logs.some((l) => l.habit_id === h.id);

  async function toggle(h: Habit) {
    const has = done(h);
    if (has) tap();
    else success();
    setData((d) => d && { ...d, logs: has ? d.logs.filter((l) => l.habit_id !== h.id) : [...d.logs, { habit_id: h.id, day: today }] });
    const { error } = has
      ? await supabase.from("habit_logs").delete().eq("habit_id", h.id).eq("day", today)
      : await supabase.from("habit_logs").insert({ habit_id: h.id, day: today });
    // Put it back if the save failed, so the screen never lies.
    if (error) setData((d) => d && { ...d, logs: has ? [...d.logs, { habit_id: h.id, day: today }] : d.logs.filter((l) => l.habit_id !== h.id) });
  }

  if (!good.length)
    return (
      <Link href="/habits" className="card card-link flex items-center justify-between text-sm">
        <span>✅ Add the habits you want to build</span>
        <span className="muted">→</span>
      </Link>
    );

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <p className="label !mb-0">✅ Habits · {good.filter(done).length}/{good.length}</p>
        <Link href="/habits" className="text-xs muted">Edit</Link>
      </div>
      <div className="flex flex-wrap gap-2">
        {good.map((h) => {
          const on = done(h);
          return (
            <button key={h.id} onClick={() => toggle(h)} aria-pressed={on} className={`chip ${on ? "!border-emerald-500 bg-emerald-500 text-white" : ""}`}>
              <span key={String(on)} className={on ? "pop mr-1 inline-block" : "mr-1 inline-block opacity-50"}>{on ? "✓" : "○"}</span>
              {h.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NextUp({ data }: { data: Data }) {
  return (
    <div className="card space-y-2">
      <p className="label">Coming up</p>
      {data.events.map((e) => (
        <div key={e.external_id} className="flex gap-3 text-sm">
          <span className="w-16 shrink-0 muted num">
            {new Date(e.starts_at).toLocaleString("en-GB", e.all_day ? { weekday: "short" } : { hour: "2-digit", minute: "2-digit" })}
          </span>
          <span className="truncate">📅 {e.title}</span>
        </div>
      ))}
      {data.mail.map((m) => (
        <div key={m.external_id} className="flex gap-3 text-sm">
          <span className="w-16 shrink-0 muted">unread</span>
          <span className="min-w-0 truncate">
            {MAIL_ICON[m.category] ?? "✉️"} <span className="font-medium">{m.from_name}</span> <span className="muted">{m.subject}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
