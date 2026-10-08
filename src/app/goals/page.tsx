"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Progress from "@/components/Progress";
import { AREAS, type Area, type Goal } from "@/lib/types";
import { goalProgress } from "@/lib/goals";

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [title, setTitle] = useState("");
  const [area, setArea] = useState<Area>("growth");

  const load = useCallback(async () => {
    const { data } = await supabase.from("goals").select("*").order("created_at");
    setGoals(data ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addGoal() {
    if (!title.trim()) return;
    await supabase.from("goals").insert({ title: title.trim(), area });
    setTitle("");
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

      <div className="card flex flex-col gap-2 sm:flex-row">
        <input className="input" placeholder="New goal" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addGoal()} />
        <select className="input capitalize sm:w-36" value={area} onChange={(e) => setArea(e.target.value as Area)}>
          {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <button className="btn" onClick={addGoal}>Add</button>
      </div>
    </div>
  );
}

function GoalCard({ goal, steps, reload }: { goal: Goal; steps: Goal[]; reload: () => void }) {
  const [step, setStep] = useState("");
  const [value, setValue] = useState(String(goal.current));
  const [done, max] = goalProgress(goal, steps);

  async function addStep() {
    if (!step.trim()) return;
    await supabase.from("goals").insert({ title: step.trim(), area: goal.area, parent_id: goal.id });
    setStep("");
    reload();
  }

  async function saveValue() {
    await supabase.from("goals").update({ current: Number(value) || 0 }).eq("id", goal.id);
    reload();
  }

  async function toggleStep(s: Goal) {
    await supabase.from("goals").update({ done: !s.done }).eq("id", s.id);
    reload();
  }

  async function remove(g: Goal) {
    if (!confirm(`Delete "${g.title}"?`)) return;
    await supabase.from("goals").delete().eq("id", g.id);
    reload();
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium">{goal.title}</span>
        <button onClick={() => remove(goal)} className="text-xs text-zinc-400">✕</button>
      </div>
      <Progress value={done} max={max} />

      {steps.length === 0 && (
        <div className="flex items-center gap-2 text-sm">
          <input className="input w-24" type="number" value={value} onChange={(e) => setValue(e.target.value)} onBlur={saveValue} />
          <span className="text-zinc-500">of {goal.target} {goal.unit}</span>
        </div>
      )}

      <ul className="space-y-1">
        {steps.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={s.done} onChange={() => toggleStep(s)} className="h-4 w-4 accent-emerald-500" />
            <span className={s.done ? "text-zinc-400 line-through" : ""}>{s.title}</span>
            <button onClick={() => remove(s)} className="ml-auto text-xs text-zinc-400">✕</button>
          </li>
        ))}
      </ul>
      <input className="input" placeholder="+ Small step (Enter)" value={step} onChange={(e) => setStep(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addStep()} />
    </div>
  );
}
