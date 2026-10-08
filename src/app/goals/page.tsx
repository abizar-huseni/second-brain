"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Progress from "@/components/Progress";
import { AREAS, type Area, type Goal } from "@/lib/types";
import { goalProgress, stepShare } from "@/lib/goals";
import { lday } from "@/lib/ldates";
import { daysBetween, fmtDay } from "@/lib/situation";

type Fields = { title: string; area: Area; target: string; unit: string; deadline: string };
const blank = (area: Area = "growth"): Fields => ({ title: "", area, target: "100", unit: "%", deadline: "" });
const toRow = (f: Fields) => ({ title: f.title.trim(), area: f.area, target: Number(f.target) > 0 ? Number(f.target) : 100, unit: f.unit.trim() || "%", deadline: f.deadline || null });

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [form, setForm] = useState<Fields>(blank());
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase.from("goals").select("*").order("created_at");
    setGoals(data ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addGoal() {
    if (!form.title.trim()) return;
    const { error: e } = await supabase.from("goals").insert(toRow(form));
    if (e) return setError(e.message);
    setError("");
    setForm(blank(form.area));
    setMore(false);
    load();
  }

  const big = goals.filter((g) => !g.parent_id);

  return (
    <div className="space-y-4">
      {AREAS.map((a) => {
        const inArea = big.filter((g) => g.area === a);
        if (!inArea.length) return null;
        return (
          <section key={a} className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{a}</h2>
            {inArea.map((g) => (
              <GoalCard key={g.id} goal={g} steps={goals.filter((s) => s.parent_id === g.id)} reload={load} />
            ))}
          </section>
        );
      })}

      <div className="card space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input className="input" placeholder="New goal" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addGoal()} />
          <select className="input capitalize sm:w-36" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value as Area })}>
            {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <button className="btn btn-accent" onClick={addGoal}>Add</button>
        </div>
        {more ? <GoalFields f={form} set={setForm} /> : (
          <button className="text-xs text-zinc-500" onClick={() => setMore(true)}>＋ Target and deadline</button>
        )}
        {error && <p className="text-sm text-amber-600">{error}</p>}
      </div>
    </div>
  );
}

// Target, unit and deadline: shared by the add and edit forms.
function GoalFields({ f, set }: { f: Fields; set: (f: Fields) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <label className="space-y-1">
        <span className="label">Target</span>
        <input className="input" type="number" min={1} value={f.target} onChange={(e) => set({ ...f, target: e.target.value })} />
      </label>
      <label className="space-y-1">
        <span className="label">Unit</span>
        <input className="input" placeholder="%, £, km" maxLength={12} value={f.unit} onChange={(e) => set({ ...f, unit: e.target.value })} />
      </label>
      <label className="space-y-1">
        <span className="label">Deadline</span>
        <input className="input px-2" type="date" value={f.deadline} onChange={(e) => set({ ...f, deadline: e.target.value })} />
      </label>
    </div>
  );
}

function Due({ day }: { day: string }) {
  const left = daysBetween(lday(), day);
  const tone = left < 0 ? "text-rose-500" : left <= 7 ? "text-amber-600 dark:text-amber-400" : "text-zinc-500";
  return <span className={`text-xs ${tone}`}>{left < 0 ? `was due ${fmtDay(day)}` : left === 0 ? "due today" : `due ${fmtDay(day)} · ${left}d`}</span>;
}

function GoalCard({ goal, steps, reload }: { goal: Goal; steps: Goal[]; reload: () => void }) {
  const [step, setStep] = useState("");
  const [value, setValue] = useState(String(goal.current));
  const [edit, setEdit] = useState<Fields | null>(null);
  const [done, max] = goalProgress(goal, steps);

  async function addStep() {
    if (!step.trim()) return;
    await supabase.from("goals").insert({ title: step.trim(), area: goal.area, parent_id: goal.id, target: 100, unit: "%" });
    setStep("");
    reload();
  }

  async function saveValue() {
    await supabase.from("goals").update({ current: Number(value) || 0 }).eq("id", goal.id);
    reload();
  }

  async function saveEdit() {
    if (!edit?.title.trim()) return;
    await supabase.from("goals").update(toRow(edit)).eq("id", goal.id);
    setEdit(null);
    reload();
  }

  async function toggleStep(s: Goal) {
    await supabase.from("goals").update({ done: !s.done, current: !s.done ? s.target : Math.min(Number(s.current), Number(s.target) - 1) }).eq("id", s.id);
    reload();
  }

  // Dragging a step's own bar to the end ticks it off.
  async function stepTo(s: Goal, pct: number) {
    const current = Math.round((pct / 100) * Number(s.target));
    await supabase.from("goals").update({ current, done: pct >= 100 }).eq("id", s.id);
    reload();
  }

  async function remove(g: Goal) {
    if (!confirm(`Delete "${g.title}"?`)) return;
    await supabase.from("goals").delete().eq("id", g.id);
    reload();
  }

  if (edit) {
    return (
      <div className="card space-y-2">
        <input className="input" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
        <select className="input capitalize" value={edit.area} onChange={(e) => setEdit({ ...edit, area: e.target.value as Area })}>
          {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <GoalFields f={edit} set={setEdit} />
        <div className="flex gap-2">
          <button className="btn btn-accent flex-1" onClick={saveEdit}>Save</button>
          <button className="btn flex-1" onClick={() => setEdit(null)}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{goal.title}</p>
          {goal.deadline && <Due day={goal.deadline} />}
        </div>
        <div className="flex shrink-0 gap-3 text-xs text-zinc-400">
          <button aria-label="Edit goal" onClick={() => setEdit({ title: goal.title, area: goal.area, target: String(goal.target), unit: goal.unit, deadline: goal.deadline ?? "" })}>✎</button>
          <button aria-label="Delete goal" onClick={() => remove(goal)}>✕</button>
        </div>
      </div>
      <Progress value={done} max={max} />

      {steps.length === 0 && (
        <div className="flex items-center gap-2 text-sm">
          <input className="input w-24" type="number" value={value} onChange={(e) => setValue(e.target.value)} onBlur={saveValue} />
          <span className="text-zinc-500">of {goal.unit === "£" ? `£${Number(goal.target).toLocaleString("en-GB")}` : `${goal.target} ${goal.unit}`}</span>
        </div>
      )}

      <ul className="space-y-2">
        {steps.map((s) => {
          const pct = Math.round(stepShare(s) * 100);
          return (
            <li key={s.id} className="space-y-1 text-sm">
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={s.done} onChange={() => toggleStep(s)} aria-label={`Done: ${s.title}`} className="h-4 w-4 accent-emerald-500" />
                <span className={`flex-1 ${s.done ? "text-zinc-400 line-through" : ""}`}>{s.title}</span>
                <span className="w-9 text-right text-xs tabular-nums text-zinc-500">{pct}%</span>
                <button aria-label={`Delete step: ${s.title}`} onClick={() => remove(s)} className="text-xs text-zinc-400">✕</button>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={10}
                defaultValue={pct}
                key={pct}
                aria-label={`Progress: ${s.title}`}
                onPointerUp={(e) => stepTo(s, Number(e.currentTarget.value))}
                onKeyUp={(e) => stepTo(s, Number(e.currentTarget.value))}
                className="h-1.5 w-full accent-emerald-500"
              />
            </li>
          );
        })}
      </ul>
      <input className="input" placeholder="+ Small step (Enter)" value={step} onChange={(e) => setStep(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addStep()} />
    </div>
  );
}
