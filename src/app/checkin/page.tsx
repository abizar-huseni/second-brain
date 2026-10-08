"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { toDay } from "@/lib/dates";
import type { Checkin } from "@/lib/types";

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
  const [saved, setSaved] = useState("");

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
    setSaved(error ? error.message : "Saved. Good work.");
    setTimeout(() => setSaved(""), 3000);
  }

  const set = <K extends keyof Checkin>(key: K, value: Checkin[K]) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["morning", "night"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`flex-1 rounded-lg py-2 text-sm capitalize ${kind === k ? "btn" : "border border-zinc-300 dark:border-zinc-700"}`}
          >
            {k}
          </button>
        ))}
      </div>

      <div className="card space-y-4">
        <Scale label="Mood" value={form.mood} onChange={(v) => set("mood", v)} />
        <Scale label="Energy" value={form.energy} onChange={(v) => set("energy", v)} />

        {kind === "morning" ? (
          <Field label="Top 3 for today" value={form.priorities} onChange={(v) => set("priorities", v)} rows={3} />
        ) : (
          <>
            <Field label="What got done" value={form.wins} onChange={(v) => set("wins", v)} rows={3} />
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

        <Field label="Journal" value={form.journal} onChange={(v) => set("journal", v)} rows={5} />

        <button className="btn w-full" onClick={save}>Save {kind} check-in</button>
        {saved && <p className="text-center text-sm text-emerald-600">{saved}</p>}
      </div>
    </div>
  );
}

function Scale({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="grid grid-cols-10 gap-1">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            onClick={() => onChange(n)}
            className={`rounded-md py-2 text-sm tabular-nums ${
              value === n ? "bg-emerald-500 text-white" : "bg-zinc-100 dark:bg-zinc-800"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

function Field(props: { label: string; value: string | null; onChange: (v: string) => void; rows: number }) {
  return (
    <div>
      <label className="label">{props.label}</label>
      <textarea className="input" rows={props.rows} value={props.value ?? ""} onChange={(e) => props.onChange(e.target.value)} />
    </div>
  );
}
