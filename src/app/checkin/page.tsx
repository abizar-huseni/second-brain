"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { toDay } from "@/lib/dates";
import type { Checkin } from "@/lib/types";
import { ENERGY, MOOD } from "@/lib/moods";
import EmojiScale from "@/components/EmojiScale";

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
    setTimeout(() => setSaved(null), 3500);
  }

  const set = <K extends keyof Checkin>(key: K, value: Checkin[K]) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="rise space-y-4">
      <div className="flex gap-2">
        {(["morning", "night"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`flex-1 rounded-xl py-2 text-sm capitalize transition ${kind === k ? "btn" : "border border-zinc-300 dark:border-zinc-700"}`}
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

        <button className="btn w-full py-3" onClick={save}>Save {kind} check-in</button>
        {saved && (
          <div className="celebrate text-center">
            <p className="text-4xl">{saved.ok ? "🎉" : "⚠️"}</p>
            <p className={`text-sm ${saved.ok ? "text-emerald-600" : "text-amber-600"}`}>{saved.text}</p>
          </div>
        )}
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
