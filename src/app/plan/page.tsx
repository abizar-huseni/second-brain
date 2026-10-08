"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { toDay } from "@/lib/dates";
import { addDays, weekStart } from "@/lib/ldates";
import { gbp } from "@/lib/money";
import { callApi, errorText } from "@/lib/api";
import { useAssistantName } from "@/lib/useAssistant";
import type { DayPlan, MoneyPlan, PlanKind, WeekPlan, YearPlan } from "@/lib/plan";

type Task = { id: string; title: string; day: string | null; must: boolean; done: boolean; source: string };
type Bill = { id: string; name: string; amount: number; next_due: string; every: string };
type PlanRow = { kind: PlanKind; period: string; content: Record<string, unknown>; created_at: string };

const TABS = [
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "week", label: "Week" },
  { key: "year", label: "Year" },
  { key: "money", label: "Money" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const AREA_ICON: Record<string, string> = { growth: "🌱", fitness: "💪", mind: "🧠", money: "💷", work: "💼" };

export default function PlanPage() {
  const name = useAssistantName();
  const today = toDay();
  const tomorrow = addDays(today, 1);
  const week = weekStart(today);
  const [tab, setTab] = useState<Tab>(() => (new Date().getHours() >= 19 ? "tomorrow" : "today"));
  const [tasks, setTasks] = useState<Task[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const [t, b, p] = await Promise.all([
      supabase.from("tasks").select("*").or(`done.eq.false,day.gte.${today}`).order("must", { ascending: false }).order("created_at"),
      supabase.from("bills").select("*").order("next_due"),
      supabase.from("plans").select("*").order("created_at", { ascending: false }).limit(20),
    ]);
    setTasks(t.data ?? []);
    setBills(b.data ?? []);
    setPlans(p.data ?? []);
    if (t.error?.message.includes("tasks")) setMsg("Plans and tasks are still setting up. They finish on the next deploy.");
  }, [today]);

  useEffect(() => {
    load();
  }, [load]);

  const planFor = (kind: PlanKind, period?: string) => plans.find((p) => p.kind === kind && (!period || p.period === period));
  const periodFor: Record<Exclude<Tab, "today" | "tomorrow">, string> = { week, year: today.slice(0, 7), money: week };

  async function rethink(kind: PlanKind, period: string) {
    setBusy(kind + period);
    setMsg("");
    try {
      await callApi("/api/plan", { kind, period });
      await load();
    } catch (e) {
      setMsg(errorText(e));
    }
    setBusy("");
  }

  async function addTasks(items: { title: string; day: string | null; must: boolean }[]) {
    const fresh = items.filter((i) => !tasks.some((t) => t.title === i.title && t.day === i.day));
    if (fresh.length) await supabase.from("tasks").insert(fresh.map((i) => ({ ...i, source: "ai" })));
    load();
  }

  const dayTab = tab === "today" || tab === "tomorrow";
  const day = tab === "tomorrow" ? tomorrow : today;
  const shownPlan = dayTab ? planFor("day", day) : planFor(tab, periodFor[tab]) ?? planFor(tab);

  return (
    <div className="rise space-y-4">
      <div className="flex gap-1 overflow-x-auto rounded-2xl bg-zinc-100 p-1 dark:bg-zinc-900">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`flex-1 rounded-xl px-3 py-1.5 text-sm transition ${tab === t.key ? "bg-white font-semibold shadow-sm dark:bg-zinc-800" : "text-zinc-500"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {dayTab && (
        <TaskList
          key={day}
          day={day}
          tasks={tasks.filter((t) => t.day === day || (tab === "today" && !t.done && t.day !== null && t.day < today))}
          someday={tab === "today" ? tasks.filter((t) => t.day === null && !t.done) : []}
          today={today}
          reload={load}
        />
      )}

      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <p className="label mb-0">🧠 {name}&apos;s plan{dayTab ? ` for ${tab}` : ""}</p>
          <button
            className="text-xs text-zinc-500 disabled:opacity-50"
            disabled={!!busy}
            onClick={() => rethink(dayTab ? "day" : tab, dayTab ? day : periodFor[tab as "week" | "year" | "money"])}
          >
            {busy ? "Planning…" : shownPlan ? "↻ Rethink" : "✨ Plan it"}
          </button>
        </div>
        {busy && <div className="skeleton h-24" />}
        {!busy && !shownPlan && (
          <p className="text-sm text-zinc-500">
            {dayTab ? `${name} plans each day at 8pm the night before.` : tab === "week" ? `${name} plans each week on Sunday evening.` : tab === "year" ? `${name} rethinks your year every month.` : `${name} redoes your money plan every Monday.`} Tap Plan it to do it now.
          </p>
        )}
        {!busy && shownPlan && (
          <div key={shownPlan.created_at} className="stagger space-y-3">
            {shownPlan.kind === "day" && <DayView plan={shownPlan.content as DayPlan} onAdd={(items) => addTasks(items.map((title) => ({ title, day, must: true })))} />}
            {shownPlan.kind === "week" && <WeekView plan={shownPlan.content as WeekPlan} />}
            {shownPlan.kind === "year" && <YearView plan={shownPlan.content as YearPlan} />}
            {shownPlan.kind === "money" && <MoneyView plan={shownPlan.content as MoneyPlan} />}
          </div>
        )}
        {msg && <p className="notice">{msg}</p>}
      </div>

      {tab === "week" && <TaskList day={null} tasks={tasks.filter((t) => t.day === null && !t.done)} someday={[]} today={today} reload={load} />}
      {tab === "money" && <Bills bills={bills} today={today} reload={load} />}
    </div>
  );
}

function TaskList({ day, tasks, someday, today, reload }: { day: string | null; tasks: Task[]; someday: Task[]; today: string; reload: () => void }) {
  const [title, setTitle] = useState("");
  const [must, setMust] = useState(false);
  const [local, setLocal] = useState<Record<string, boolean>>({});

  async function add() {
    if (!title.trim()) return;
    await supabase.from("tasks").insert({ title: title.trim(), day, must });
    setTitle("");
    setMust(false);
    reload();
  }
  async function toggle(t: Task) {
    const done = !(local[t.id] ?? t.done);
    setLocal((l) => ({ ...l, [t.id]: done }));
    await supabase.from("tasks").update({ done, done_at: done ? new Date().toISOString() : null }).eq("id", t.id);
  }
  async function remove(t: Task) {
    await supabase.from("tasks").delete().eq("id", t.id);
    reload();
  }

  const row = (t: Task) => {
    const done = local[t.id] ?? t.done;
    return (
      <li key={t.id} className="group flex items-center gap-3 py-1.5">
        <button
          onClick={() => toggle(t)}
          aria-label={done ? "Mark not done" : "Mark done"}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs text-white transition ${done ? "border-emerald-500 bg-emerald-500" : t.must ? "border-rose-400" : "border-zinc-300 dark:border-zinc-600"}`}
        >
          {done && <span className="pop">✓</span>}
        </button>
        <span className={`min-w-0 flex-1 text-sm transition ${done ? "text-zinc-400 line-through" : ""}`}>
          {t.must && !done && "⭐ "}
          {t.title}
          {t.day && t.day < today && !done && <span className="ml-1 text-xs text-rose-500">overdue</span>}
          {t.source === "ai" && <span className="ml-1 text-[10px] text-zinc-400">suggested</span>}
        </span>
        <button onClick={() => remove(t)} className="text-xs text-zinc-400 opacity-60 hover:opacity-100" aria-label="Delete task">
          ✕
        </button>
      </li>
    );
  };

  const open = tasks.filter((t) => !(local[t.id] ?? t.done)).length;
  return (
    <div className="card space-y-2">
      <div className="flex items-baseline justify-between">
        <p className="label mb-0">{day === null ? "🗂️ Someday" : "✅ My tasks"}</p>
        {tasks.length > 0 && <span className="text-xs text-zinc-500">{open === 0 ? "All done 🎉" : `${open} to go`}</span>}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input className="input" placeholder={day === null ? "Something for later…" : "Add a task…"} value={title} onChange={(e) => setTitle(e.target.value)} />
        {day !== null && (
          <button type="button" onClick={() => setMust((m) => !m)} className={`chip shrink-0 ${must ? "border-amber-400 bg-amber-50 dark:bg-amber-500/10" : ""}`} title="Non-negotiable">
            {must ? "⭐" : "☆"}
          </button>
        )}
        <button className="btn shrink-0">Add</button>
      </form>
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {tasks.map(row)}
        {someday.length > 0 && <li className="pt-3 text-xs font-medium uppercase tracking-wide text-zinc-400">Someday</li>}
        {someday.map(row)}
      </ul>
    </div>
  );
}

function DayView({ plan, onAdd }: { plan: DayPlan; onAdd: (titles: string[]) => void }) {
  const [added, setAdded] = useState(false);
  return (
    <>
      <p className="text-lg font-semibold leading-snug">{plan.headline}</p>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-600">Non-negotiables</p>
          <button
            className="text-xs font-medium text-emerald-700 disabled:text-zinc-400 dark:text-emerald-400"
            disabled={added}
            onClick={() => {
              onAdd((plan.non_negotiables ?? []).map((n) => n.title));
              setAdded(true);
            }}
          >
            {added ? "Added ✓" : "＋ Add to my tasks"}
          </button>
        </div>
        {(plan.non_negotiables ?? []).map((n, i) => (
          <div key={i} className="flex gap-3 rounded-xl bg-rose-50 p-3 dark:bg-rose-500/10">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-500 text-xs font-bold text-white">{i + 1}</span>
            <div>
              <p className="text-sm font-medium">{n.title}</p>
              <p className="text-xs text-zinc-500">{n.why}</p>
            </div>
          </div>
        ))}
      </div>
      {!!plan.should?.length && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">If there&apos;s time</p>
          <ul className="space-y-1 text-sm">
            {plan.should.map((s, i) => (
              <li key={i}>○ {s.title}</li>
            ))}
          </ul>
        </div>
      )}
      {!!plan.schedule?.length && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Shape of the day</p>
          <ol className="relative space-y-2 border-l-2 border-zinc-200 pl-4 dark:border-zinc-700">
            {plan.schedule.map((b, i) => (
              <li key={i} className="text-sm">
                <span className="absolute -left-[5px] mt-1.5 h-2 w-2 rounded-full bg-emerald-500" />
                <span className="mr-2 tabular-nums text-zinc-500">{b.time}</span>
                {b.what}
              </li>
            ))}
          </ol>
        </div>
      )}
      {plan.money && <p className="text-sm">💷 {plan.money}</p>}
      {plan.avoid?.map((a, i) => (
        <p key={i} className="text-sm">
          🚫 {a}
        </p>
      ))}
    </>
  );
}

function WeekView({ plan }: { plan: WeekPlan }) {
  return (
    <>
      <p className="text-lg font-semibold leading-snug">{plan.theme}</p>
      {(plan.goals ?? []).map((g, i) => (
        <div key={i} className="flex gap-3 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/60">
          <span className="text-xl">{AREA_ICON[g.area] ?? "🎯"}</span>
          <div>
            <p className="text-sm font-medium">{g.title}</p>
            <p className="text-xs text-zinc-500">Done when: {g.measure}</p>
          </div>
        </div>
      ))}
      {plan.money && <p className="text-sm">💷 {plan.money}</p>}
      {plan.watch && <p className="text-sm">⚠️ {plan.watch}</p>}
    </>
  );
}

function YearView({ plan }: { plan: YearPlan }) {
  const today = toDay();
  return (
    <>
      <p className="text-base font-medium leading-snug">{plan.vision}</p>
      <ol className="relative space-y-3 border-l-2 border-zinc-200 pl-5 dark:border-zinc-700">
        {(plan.milestones ?? []).map((m, i) => (
          <li key={i}>
            <span className={`absolute -left-[7px] mt-1 h-3 w-3 rounded-full ${m.by < today ? "bg-zinc-400" : "bg-emerald-500"}`} />
            <p className="text-xs tabular-nums text-zinc-500">
              {new Date(`${m.by}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · {AREA_ICON[m.area] ?? "🎯"}
            </p>
            <p className="text-sm font-medium">{m.title}</p>
          </li>
        ))}
      </ol>
      {!!plan.principles?.length && (
        <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/60">
          {plan.principles.map((p, i) => (
            <p key={i} className="text-sm italic">
              “{p}”
            </p>
          ))}
        </div>
      )}
    </>
  );
}

function MoneyView({ plan }: { plan: MoneyPlan }) {
  const m = plan.month ?? { income: 0, fixed: 0, upcoming: 0, flexible: 0 };
  return (
    <>
      <p className="text-sm">{plan.summary}</p>
      <div className="grid grid-cols-2 gap-2">
        <Tile label="Safe to spend / day" value={gbp(plan.safe_per_day ?? 0)} strong />
        <Tile label="Save / week" value={gbp(plan.save_per_week ?? 0)} strong />
        <Tile label="Income / month" value={gbp(m.income)} />
        <Tile label="Fixed bills" value={gbp(m.fixed)} />
        <Tile label="Upcoming" value={gbp(m.upcoming)} />
        <Tile label="Flexible" value={gbp(m.flexible)} />
      </div>
      {plan.rules?.map((r, i) => (
        <p key={i} className="text-sm">
          📏 {r}
        </p>
      ))}
      {plan.debt && <p className="text-sm">💳 {plan.debt}</p>}
    </>
  );
}

function Tile({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-xl p-3 text-center ${strong ? "bg-emerald-50 dark:bg-emerald-500/10" : "bg-zinc-50 dark:bg-zinc-800/60"}`}>
      <p className={`tabular-nums ${strong ? "text-lg font-semibold text-emerald-700 dark:text-emerald-400" : "text-sm font-medium"}`}>{value}</p>
      <p className="text-[11px] text-zinc-500">{label}</p>
    </div>
  );
}

function Bills({ bills, today, reload }: { bills: Bill[]; today: string; reload: () => void }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [due, setDue] = useState(today);
  const [every, setEvery] = useState("month");
  const soon = bills.filter((b) => b.next_due <= addDays(today, 30));
  const total = soon.reduce((a, b) => a + Number(b.amount), 0);

  async function add() {
    if (!name.trim() || !(Number(amount) > 0)) return;
    await supabase.from("bills").insert({ name: name.trim(), amount: Number(amount), next_due: due, every });
    setName("");
    setAmount("");
    reload();
  }
  async function remove(b: Bill) {
    if (!confirm(`Stop tracking ${b.name}?`)) return;
    await supabase.from("bills").delete().eq("id", b.id);
    reload();
  }
  const daysTo = (d: string) => Math.round((Date.parse(`${d}T12:00:00`) - Date.parse(`${today}T12:00:00`)) / 86400000);

  return (
    <div className="card space-y-3">
      <div className="flex items-baseline justify-between">
        <p className="label mb-0">🧾 Upcoming expenses</p>
        <span className="text-xs text-zinc-500">Next 30 days: <b className="text-zinc-900 dark:text-zinc-100">{gbp(total)}</b></span>
      </div>
      {bills.length === 0 && <p className="text-sm text-zinc-500">Add rent, phone, subscriptions and big one-offs like visa fees. The plan saves for them.</p>}
      <ul className="space-y-1.5">
        {bills.map((b) => {
          const d = daysTo(b.next_due);
          return (
            <li key={b.id} className="flex items-center gap-3 text-sm">
              <span className={`w-16 shrink-0 text-xs tabular-nums ${d < 0 ? "text-rose-500" : d <= 7 ? "text-amber-600" : "text-zinc-500"}`}>
                {d < 0 ? `${-d}d late` : d === 0 ? "today" : `in ${d}d`}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {b.name} <span className="text-xs text-zinc-400">{b.every === "once" ? "one-off" : `every ${b.every}`}</span>
              </span>
              <span className="tabular-nums">{gbp(Number(b.amount))}</span>
              <button onClick={() => remove(b)} className="text-xs text-zinc-400" aria-label={`Remove ${b.name}`}>
                ✕
              </button>
            </li>
          );
        })}
      </ul>
      <div className="grid grid-cols-2 gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <input className="input col-span-2" placeholder="e.g. Rent, Graduate visa" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input" type="number" min="0" step="0.01" placeholder="£" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        <select className="input" value={every} onChange={(e) => setEvery(e.target.value)}>
          <option value="month">Every month</option>
          <option value="week">Every week</option>
          <option value="year">Every year</option>
          <option value="once">One-off</option>
        </select>
        <button className="btn" onClick={add}>
          Add
        </button>
      </div>
    </div>
  );
}
