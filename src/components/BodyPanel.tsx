"use client";
// Physique (weight, body fat, muscle) and a simple training log for the Body page.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { daysAgo, toDay } from "@/lib/dates";
import { mergeReadings, trend, type BodyRow, type Training } from "@/lib/body";
import { buzz } from "@/lib/feel";

const KINDS = ["🏋️ Gym", "🏃 Run", "🚶 Walk", "⚽ Sport", "🏠 Home workout", "🧘 Stretch"];
const sign = (v: number, unit: string) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v)}${unit}`;
const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

export default function BodyPanel() {
  const [rows, setRows] = useState<BodyRow[] | null>(null);
  const [sessions, setSessions] = useState<Training[]>([]);
  const [ready, setReady] = useState(true);

  const load = useCallback(async () => {
    const [b, t] = await Promise.all([
      supabase.from("body_log").select("measured_at, source, weight_kg, body_fat_pct, muscle_kg, lean_kg").gte("measured_at", new Date(Date.now() - 180 * 86400000).toISOString()).order("measured_at"),
      supabase.from("training_log").select("*").gte("day", daysAgo(27)).order("day", { ascending: false }).order("created_at", { ascending: false }),
    ]);
    // Until the database update has run, the card stays out of the way.
    setReady(!b.error);
    setRows(mergeReadings((b.data ?? []) as BodyRow[]));
    setSessions((t.data ?? []) as Training[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (rows === null) return <div className="skeleton h-48" />;
  if (!ready) return null;
  return (
    <>
      <Physique rows={rows} onSaved={load} />
      <TrainingLog sessions={sessions} onChange={load} />
    </>
  );
}

function Physique({ rows, onSaved }: { rows: BodyRow[]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ weight: "", fat: "", muscle: "" });
  const [msg, setMsg] = useState("");
  const weight = trend(rows, "weight_kg", 30);
  const fat = trend(rows, "body_fat_pct", 30);
  const muscle = trend(rows, "muscle_kg", 30) ?? trend(rows, "lean_kg", 30);
  const muscleLabel = trend(rows, "muscle_kg", 30) ? "Muscle" : "Lean mass";
  const points = rows.filter((r) => r.weight_kg !== null && Date.parse(r.measured_at) > Date.now() - 90 * 86400000);

  async function save() {
    const w = num(form.weight);
    const f = num(form.fat);
    const m = num(form.muscle);
    if ([w, f, m].every((x) => x === null)) return;
    if ((w !== null && !(w >= 20 && w <= 350)) || (f !== null && !(f > 1 && f < 75)) || (m !== null && !(m >= 10 && m <= 150))) {
      return setMsg("That doesn't look right. Weight and muscle are in kg, body fat in %.");
    }
    const { error } = await supabase.from("body_log").insert({ measured_at: new Date().toISOString(), source: "manual", weight_kg: w, body_fat_pct: f, muscle_kg: m });
    if (error) return setMsg(`Couldn't save: ${error.message}`);
    buzz();
    setForm({ weight: "", fat: "", muscle: "" });
    setOpen(false);
    setMsg("");
    onSaved();
  }

  return (
    <section className="card space-y-4">
      <div className="flex items-center justify-between">
        <p className="label mb-0">💪 Physique</p>
        <button onClick={() => setOpen((o) => !o)} className="text-xs font-medium text-zinc-500">
          {open ? "Cancel" : "+ Weigh in"}
        </button>
      </div>

      {weight || fat || muscle ? (
        <div className="grid grid-cols-3 gap-2 text-center">
          <Measure label="Weight" t={weight} unit="kg" />
          <Measure label="Body fat" t={fat} unit="%" />
          <Measure label={muscleLabel} t={muscle} unit="kg" />
        </div>
      ) : (
        !open && (
          <p className="text-sm text-zinc-500">
            Measure body composition on your watch (Samsung Health → Body composition) and it shows up here, or add a weigh-in yourself. Once a week, same time, is plenty.
          </p>
        )
      )}

      <Line values={points.map((p) => p.weight_kg)} unit="kg" from="90 days ago" />

      {open && (
        <div className="fade-in space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <Input label="Weight kg" value={form.weight} onChange={(v) => setForm({ ...form, weight: v })} />
            <Input label="Body fat %" value={form.fat} onChange={(v) => setForm({ ...form, fat: v })} />
            <Input label="Muscle kg" value={form.muscle} onChange={(v) => setForm({ ...form, muscle: v })} />
          </div>
          <button className="btn btn-accent w-full" onClick={save} disabled={!form.weight && !form.fat && !form.muscle}>
            Save weigh-in
          </button>
        </div>
      )}
      {msg && <p className="text-sm text-amber-600">{msg}</p>}
      {(weight?.change != null || fat?.change != null) && <p className="text-xs text-zinc-500">Changes are against your reading about 30 days earlier.</p>}
    </section>
  );
}

function Measure({ label, t, unit }: { label: string; t: ReturnType<typeof trend>; unit: string }) {
  return (
    <div className="rounded-2xl bg-zinc-500/5 px-2 py-2.5">
      <p className="text-lg font-semibold tabular-nums">{t ? `${t.value}${unit === "%" ? "%" : ""}` : "–"}</p>
      <p className="text-[11px] text-zinc-500">{label}{t && unit !== "%" ? ` (${unit})` : ""}</p>
      {t?.change != null && <p className="text-[11px] tabular-nums text-zinc-500">{sign(t.change, unit === "%" ? " pts" : unit)}</p>}
    </div>
  );
}

// One quiet line for a trend (weight, resting heart rate). Gaps (null) are skipped.
export function Line({ values, unit, from }: { values: (number | null)[]; unit: string; from: string }) {
  const have = values.filter((v): v is number => v !== null);
  if (have.length < 2) return null;
  const lo = Math.min(...have);
  const hi = Math.max(...have);
  const span = Math.max(hi - lo, 1);
  const pts = values
    .map((v, i) => (v === null ? null : `${(i / (values.length - 1)) * 100},${36 - ((v - lo) / span) * 32}`))
    .filter(Boolean)
    .join(" ");
  return (
    <div>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-14 w-full" aria-label={`Trend, ${from} to now`}>
        <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div className="flex justify-between text-[10px] text-zinc-400">
        <span>{from}</span>
        <span>
          {lo}–{hi} {unit}
        </span>
        <span>now</span>
      </div>
    </div>
  );
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input className="input" type="number" inputMode="decimal" step="0.1" min="0" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function TrainingLog({ sessions, onChange }: { sessions: Training[]; onChange: () => void }) {
  const [what, setWhat] = useState("");
  const [minutes, setMinutes] = useState("");
  const [msg, setMsg] = useState("");
  const week = sessions.filter((s) => s.day >= daysAgo(6));
  const weekMin = week.reduce((t, s) => t + (s.minutes ?? 0), 0);

  async function add() {
    const m = num(minutes);
    if (!what.trim()) return;
    if (m !== null && !(m >= 1 && m <= 600)) return setMsg("Minutes should be between 1 and 600.");
    const { error } = await supabase.from("training_log").insert({ day: toDay(), what: what.trim().slice(0, 80), minutes: m === null ? null : Math.round(m) });
    if (error) return setMsg(`Couldn't save: ${error.message}`);
    buzz();
    setWhat("");
    setMinutes("");
    setMsg("");
    onChange();
  }

  async function remove(id?: string) {
    if (!id) return;
    await supabase.from("training_log").delete().eq("id", id);
    onChange();
  }

  return (
    <section className="card space-y-3">
      <div className="flex items-baseline justify-between">
        <p className="label mb-0">🏋️ Training</p>
        <span className="text-xs text-zinc-500">
          This week: {week.length} {week.length === 1 ? "session" : "sessions"}
          {weekMin ? `, ${weekMin} min` : ""}
        </span>
      </div>
      <div className="no-scrollbar fade-right -mx-1 flex gap-1.5 overflow-x-auto px-1">
        {KINDS.map((k) => (
          <button key={k} onClick={() => setWhat(k.split(" ").slice(1).join(" "))} className={`chip shrink-0 ${what === k.split(" ").slice(1).join(" ") ? "!border-[var(--accent)] font-medium" : ""}`}>
            {k}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input className="input flex-1" placeholder="What did you train? e.g. Push day" value={what} onChange={(e) => setWhat(e.target.value)} />
        <input className="input w-20" type="number" inputMode="numeric" min="1" placeholder="min" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
      </div>
      <button className="btn w-full" onClick={add} disabled={!what.trim()}>
        Log today&apos;s session
      </button>
      {msg && <p className="text-sm text-amber-600">{msg}</p>}
      {sessions.length > 0 && (
        <ul className="divide-y divide-zinc-500/10 text-sm">
          {sessions.slice(0, 6).map((s) => (
            <li key={s.id} className="flex items-center gap-2 py-2">
              <span className="w-16 shrink-0 text-xs text-zinc-500">{new Date(`${s.day}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric" })}</span>
              <span className="min-w-0 flex-1 truncate">
                {s.what}
                {s.source && s.source !== "manual" && <span className="ml-1.5 text-xs text-zinc-400" title="From your watch">⌚</span>}
              </span>
              {s.minutes && <span className="text-xs tabular-nums text-zinc-500">{s.minutes} min</span>}
              <button onClick={() => remove(s.id)} aria-label={`Remove ${s.what}`} className="px-1 text-zinc-400">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-zinc-500">Workouts from your watch appear here on their own. NHS: strength work for all major muscles on at least 2 days a week, plus 150 minutes of moderate activity.</p>
    </section>
  );
}
