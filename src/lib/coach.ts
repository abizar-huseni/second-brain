// Server-only: turns the user's recent data into a short text the AI coach can read.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Checkin, Debt, Goal, Habit, HabitLog, Note, Payslip, Transaction } from "./types";
import type { HealthDay } from "./samsung";

const TZ = "Europe/London";
const dayOf = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });
const ago = (n: number) => dayOf(new Date(Date.now() - n * 86400000));
const cut = (s: string | null | undefined, n: number) => (s ? s.replace(/\s+/g, " ").trim().slice(0, n) : "");
const pct = (a: number, b: number) => (b > 0 ? Math.round((Math.min(a, b) / b) * 100) : 0);

export type Brief = {
  headline: string;
  focus: { title: string; why: string; area?: string }[];
  watch_out?: string;
  win?: string;
};

export const SYSTEM = `You are the personal coach inside a "second brain" life dashboard.
You see the user's real data: check-ins (mood and energy 1-10), habits, goals, watch health data, money and notes.
Style: direct and demanding but fair, like Marcus Aurelius crossed with a good coach. UK English, £. No fluff, no therapy-speak, no emojis.
Rules:
- Base everything on the data. Never invent numbers. If something isn't logged, say so and make logging it part of the advice.
- Praise only what was earned. Call out slipping habits, poor sleep or overspending plainly.
- Be specific: name the goal, habit or number you're reacting to.
- Short: every line under 25 words.`;

export const BRIEF_FORMAT = `Reply with only this JSON:
{"headline": "one punchy line about today",
 "focus": [{"title": "action to do today", "why": "the data behind it", "area": "growth|fitness|mind|money|work"}],
 "watch_out": "one risk to avoid, or empty",
 "win": "one earned piece of praise, or empty"}
Give exactly 3 focus items, most important first.`;

export async function buildContext(db: SupabaseClient): Promise<string> {
  const today = ago(0);
  const monthStart = `${today.slice(0, 8)}01`;
  const [c, h, l, g, hd, t, d, p, n] = await Promise.all([
    db.from("checkins").select("*").gte("day", ago(6)).order("day"),
    db.from("habits").select("*").eq("archived", false),
    db.from("habit_logs").select("habit_id, day").gte("day", ago(60)),
    db.from("goals").select("*"),
    db.from("health_days").select("*").gte("day", ago(6)).order("day"),
    db.from("transactions").select("day, kind, amount, category").gte("day", monthStart),
    db.from("debts").select("*"),
    db.from("payslips").select("*").order("pay_date", { ascending: false }).limit(1),
    db.from("notes").select("body, created_at").order("created_at", { ascending: false }).limit(8),
  ]);
  const checkins = (c.data ?? []) as Checkin[];
  const habits = (h.data ?? []) as Habit[];
  const logs = (l.data ?? []) as HabitLog[];
  const goals = (g.data ?? []) as Goal[];
  const health = (hd.data ?? []) as HealthDay[];
  const tx = (t.data ?? []) as Transaction[];
  const debts = (d.data ?? []) as Debt[];
  const slip = (p.data?.[0] ?? null) as Payslip | null;
  const notes = (n.data ?? []) as Pick<Note, "body" | "created_at">[];

  const now = new Date();
  const out: string[] = [
    `Now: ${now.toLocaleString("en-GB", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}`,
  ];

  out.push("\n## Check-ins, last 7 days");
  if (!checkins.length) out.push("None logged.");
  for (const x of checkins) {
    const bits = [`${x.day} ${x.kind}: mood ${x.mood ?? "?"}, energy ${x.energy ?? "?"}`];
    if (x.hours_worked) bits.push(`worked ${x.hours_worked}h`);
    if (x.priorities) bits.push(`top 3: ${cut(x.priorities, 160)}`);
    if (x.wins) bits.push(`done: ${cut(x.wins, 160)}`);
    if (x.journal) bits.push(`journal: ${cut(x.journal, 280)}`);
    out.push(bits.join(" | "));
  }

  out.push("\n## Habits");
  if (!habits.length) out.push("None set up.");
  for (const hb of habits) {
    const days = new Set(logs.filter((x) => x.habit_id === hb.id).map((x) => x.day));
    const week = Array.from({ length: 7 }, (_, i) => ago(i)).filter((x) => days.has(x)).length;
    let s = 0;
    if (hb.kind === "good") for (let i = days.has(today) ? 0 : 1; days.has(ago(i)); i++) s++;
    else while (s < 60 && !days.has(ago(s))) s++;
    out.push(
      hb.kind === "good"
        ? `Build "${hb.name}": ${days.has(today) ? "done today" : "not done today"}, ${week}/7 this week, streak ${s}`
        : `Break "${hb.name}": slipped ${week}/7 days this week, ${s >= 60 ? "no slips logged in 60 days" : `${s} clean days`}${days.has(today) ? ", slipped today" : ""}`,
    );
  }

  out.push("\n## Goals");
  const top = goals.filter((x) => !x.parent_id);
  if (!top.length) out.push("None set.");
  for (const goal of top) {
    const subs = goals.filter((x) => x.parent_id === goal.id);
    const progress = subs.length ? pct(subs.filter((x) => x.done).length, subs.length) : goal.done ? 100 : pct(Number(goal.current), Number(goal.target));
    const next = subs.filter((x) => !x.done).slice(0, 3).map((x) => x.title);
    out.push(
      `${goal.title} [${goal.area}] ${progress}%${goal.deadline ? `, due ${goal.deadline}` : ""}${next.length ? `; next steps: ${next.join("; ")}` : ""}`,
    );
  }

  out.push("\n## Health from watch, last 7 days");
  if (!health.length) out.push("No watch data synced this week.");
  for (const x of health) {
    const bits = [x.day];
    if (x.steps != null) bits.push(`${x.steps} steps`);
    if (x.sleep_min != null) bits.push(`slept ${Math.floor(x.sleep_min / 60)}h${x.sleep_min % 60}m`);
    if (x.exercise_min) bits.push(`${x.exercise_min} min exercise`);
    if (x.hr_min != null) bits.push(`resting HR ${x.hr_min}`);
    if (x.stress_avg != null) bits.push(`stress ${x.stress_avg}`);
    out.push(bits.join(", "));
  }

  out.push("\n## Money this month");
  const real = tx.filter((x) => x.category !== "transfer");
  const income = real.filter((x) => x.kind === "income").reduce((a, x) => a + Number(x.amount), 0);
  const byCat = new Map<string, number>();
  for (const x of real.filter((x) => x.kind === "expense")) byCat.set(x.category, (byCat.get(x.category) ?? 0) + Number(x.amount));
  const spent = [...byCat.values()].reduce((a, b) => a + b, 0);
  out.push(real.length ? `In £${income.toFixed(0)}, out £${spent.toFixed(0)}` : "No transactions this month.");
  if (byCat.size) out.push(`Spending: ${[...byCat].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} £${v.toFixed(0)}`).join(", ")}`);
  for (const x of debts) {
    out.push(`Debt "${x.name}": £${Number(x.balance).toFixed(0)} left of £${Number(x.start_balance).toFixed(0)}${x.apr ? `, ${x.apr}% APR` : ""}${x.min_payment ? `, min £${x.min_payment}/month` : ""}`);
  }
  if (slip) out.push(`Last payslip ${slip.pay_date}: net £${Number(slip.net).toFixed(0)}${slip.hours ? ` for ${slip.hours}h` : ""}`);

  if (notes.length) {
    out.push("\n## Recent notes (newest first)");
    for (const x of notes) out.push(`- ${cut(x.body, 160)}`);
  }
  return out.join("\n");
}
