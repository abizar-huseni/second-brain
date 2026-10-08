"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { daysAgo, toDay } from "@/lib/dates";
import type { Checkin } from "@/lib/types";
import { ENERGY, faceFor, MOOD, moodColor } from "@/lib/moods";
import EmojiScale from "@/components/EmojiScale";
import { success } from "@/lib/haptics";

const empty = (kind: Checkin["kind"]): Checkin => ({
  day: toDay(),
  kind,
  mood: null,
  energy: null,
  priorities: null,
  wins: null,
  journal: null,
  hours_worked: null,
});

export default function CheckinPage() {
  const [kind, setKind] = useState<Checkin["kind"]>(() => (new Date().getHours() < 15 ? "morning" : "night"));
  const [form, setForm] = useState<Checkin>(empty(kind));
  const [saved, setSaved] = useState<{ ok: boolean; text: string } | null>(null);
  const [history, setHistory] = useState<{ day: string; mood: number | null }[]>([]);
  const router = useRouter();

  useEffect(() => {
    supabase
      .from("checkins")
      .select("day, mood")
      .gte("day", daysAgo(13))
      .then(({ data }) => setHistory((data ?? []) as { day: string; mood: number | null }[]));
  }, [saved]);

  const load = useCallback(async (k: Checkin["kind"]) => {
    const { data } = await supabase.from("checkins").select("*").eq("day", toDay()).eq("kind", k).maybeSingle();
    setForm(data ?? empty(k));
  }, []);

  useEffect(() => {
    load(kind);
  }, [kind, load]);

  async function save() {
    const { day, kind, mood, energy, priorities, wins, journal, hours_worked } = form;
    const row = { day, kind, mood, energy, priorities, wins, journal, hours_worked };
    const { error } = await supabase.from("checkins").upsert(row, { onConflict: "user_id,day,kind" });
    setSaved({ ok: !error, text: error ? error.message : kind === "morning" ? "Locked in. Go win the day." : "Logged. Rest well, go again tomorrow." });
    if (!error) {
      success();
      setTimeout(() => router.push("/"), 1400); // back to Today once it's saved
    } else setTimeout(() => setSaved(null), 3500);
  }

  const set = <K extends keyof Checkin>(key: K, value: Checkin[K]) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="rise space-y-4">
      <div className="flex gap-2">
        {(["morning", "night"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`chip flex-1 py-2 capitalize ${kind === k ? "chip-on" : ""}`}
          >
            {k === "morning" ? "🌅" : "🌙"} {k}
          </button>
        ))}
      </div>

      <div className="card space-y-4">
        <EmojiScale label="How do you feel?" scale={MOOD} value={form.mood} onChange={(v) => set("mood", v)} />
        <EmojiScale label="Energy" scale={ENERGY} value={form.energy} onChange={(v) => set("energy", v)} />

        {kind === "morning" ? (
          <Field label="Top 3 for today" value={form.priorities} onChange={(v) => set("priorities", v)} rows={3} placeholder={"1. \n2. \n3. "} />
        ) : (
          <>
            <Field label="What got done" value={form.wins} onChange={(v) => set("wins", v)} rows={3} placeholder="Wins, big or small" />
            <div>
              <label className="label">Hours worked</label>
              <input
                className="input"
                type="number"
                step="0.25"
                min="0"
                value={form.hours_worked ?? ""}
                onChange={(e) => set("hours_worked", e.target.value === "" ? null : Number(e.target.value))}
              />
            </div>
          </>
        )}

        <Field label="Journal" value={form.journal} onChange={(v) => set("journal", v)} rows={5} placeholder="What's on your mind?" />

        <button className="btn-accent w-full !py-3" onClick={save}>Save {kind} check-in</button>
        {saved && (
          <div className="celebrate text-center">
            <p className="text-4xl">{saved.ok ? "🎉" : "⚠️"}</p>
            <p className={`text-sm ${saved.ok ? "text-emerald-500" : "text-amber-500"}`}>{saved.text}</p>
          </div>
        )}
      </div>

      <MoodStrip history={history} />
    </div>
  );
}

// Mood over the last 14 days, as coloured bars with the face for the latest day.
function MoodStrip({ history }: { history: { day: string; mood: number | null }[] }) {
  const days = Array.from({ length: 14 }, (_, i) => {
    const day = daysAgo(13 - i);
    const vals = history.filter((c) => c.day === day && c.mood).map((c) => c.mood as number);
    return { day, value: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null };
  });
  const last = [...days].reverse().find((m) => m.value !== null);
  if (!last) return null;
  return (
    <div className="card">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="label !mb-0">Mood, last 14 days</p>
        <span className="text-2xl">{faceFor(MOOD, last.value)?.emoji}</span>
      </div>
      <div className="flex h-20 items-end gap-1">
        {days.map((m) => (
          <div
            key={m.day}
            title={`${m.day}: ${m.value ? faceFor(MOOD, m.value)?.label : "no check-in"}`}
            className={`flex-1 rounded-t-md transition-all duration-700 ${m.value ? moodColor(m.value) : "bg-zinc-500/10"}`}
            style={{ height: `${m.value ? m.value * 10 : 4}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function Field(props: { label: string; value: string | null; onChange: (v: string) => void; rows: number; placeholder?: string }) {
  return (
    <div>
      <label className="label">{props.label}</label>
      <textarea className="input" rows={props.rows} placeholder={props.placeholder} value={props.value ?? ""} onChange={(e) => props.onChange(e.target.value)} />
    </div>
  );
}
