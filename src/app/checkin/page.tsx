"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { checkinDay } from "@/lib/dates";
import type { Checkin } from "@/lib/types";
import { ENERGY, MOOD } from "@/lib/moods";
import EmojiScale from "@/components/EmojiScale";
import Confetti from "@/components/Confetti";

const empty = (kind: Checkin["kind"]): Checkin => ({
  day: checkinDay(kind),
  kind,
  mood: null,
  energy: null,
  priorities: null,
  wins: null,
  journal: null,
  hours_worked: null,
});

export default function CheckinPage() {
  const [kind, setKind] = useState<Checkin["kind"]>(() => {
    const h = new Date().getHours();
    return h < 4 || h >= 15 ? "night" : "morning";
  });
  const [form, setForm] = useState<Checkin>(empty(kind));
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState<{ ok: boolean; text: string } | null>(null);

  const req = useRef(0);

  const load = useCallback(async (k: Checkin["kind"]) => {
    const id = ++req.current;
    const { data } = await supabase.from("checkins").select("*").eq("day", checkinDay(k)).eq("kind", k).maybeSingle();
    // A slower answer for the other tab must not land on top of this one.
    if (id !== req.current) return;
    setForm(data ?? empty(k));
    setLoaded(true);
  }, []);
  // Until the picked tab's row is in, saving would overwrite it with a blank or other-tab form.
  const ready = loaded && form.kind === kind;

  useEffect(() => {
    load(kind);
  }, [kind, load]);

  async function save() {
    if (!ready) return;
    // Keep the day it was loaded for, so 23:50 opened and 00:10 saved still lands on tonight.
    const { day, mood, energy, priorities, wins, journal, hours_worked } = form;
    const row = { day, kind, mood, energy, priorities, wins, journal, hours_worked };
    const { error } = await supabase.from("checkins").upsert(row, { onConflict: "user_id,day,kind" });
    setSaved({ ok: !error, text: error ? error.message : kind === "morning" ? "Locked in. Go win the day." : "Logged. Rest well, go again tomorrow." });
    setTimeout(() => setSaved(null), 3500);
  }

  const set = <K extends keyof Checkin>(key: K, value: Checkin[K]) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="rise space-y-4">
      <div className="flex gap-1 rounded-2xl bg-zinc-500/10 p-1">
        {(["morning", "night"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`flex-1 rounded-xl py-2.5 text-sm capitalize transition ${kind === k ? "bg-[var(--surface)] font-semibold shadow-sm" : "text-zinc-500"}`}
          >
            {k === "morning" ? "🌅" : "🌙"} {k}
          </button>
        ))}
      </div>
      <p className="px-1 text-sm text-zinc-500">{kind === "morning" ? "Ten seconds. How are you starting the day?" : "Close the loop. How did today go?"}</p>

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

        <button className="btn btn-accent w-full py-3.5 text-base" disabled={!ready} onClick={save}>Save {kind} check-in</button>
        {saved?.ok && <Confetti />}
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
