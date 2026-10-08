// Server-only: the assistant's plans. Tomorrow's non-negotiables, the week, the year, and the money plan.
import type { SupabaseClient } from "@supabase/supabase-js";
import { chat, parseJson } from "./ai";
import { buildContext, SYSTEM } from "./coach";

export type PlanKind = "day" | "week" | "year" | "money";

export type DayPlan = {
  headline: string;
  non_negotiables: { title: string; why: string }[];
  should: { title: string }[];
  avoid: string[];
  money: string;
  schedule?: { time: string; what: string }[];
};
export type WeekPlan = { theme: string; goals: { title: string; area: string; measure: string }[]; money: string; watch: string };
export type YearPlan = { vision: string; milestones: { by: string; title: string; area: string }[]; principles: string[] };
export type MoneyPlan = {
  summary: string;
  month: { income: number; fixed: number; upcoming: number; flexible: number };
  safe_per_day: number;
  save_per_week: number;
  rules: string[];
  debt: string;
};

const ASK: Record<PlanKind, (period: string) => string> = {
  day: (p) => `Plan ${p} for this person. Think like a chief of staff: use their calendar, open tasks, deadlines, goals, habits, energy and money.
Non-negotiables are the 3 things that must happen no matter what (include their own must-do tasks first if they exist).
Reply with only JSON:
{"headline": "the point of the day in one line",
 "non_negotiables": [{"title": "specific action", "why": "the reason, with numbers"}],
 "should": [{"title": "nice to get done"}],
 "avoid": ["one thing to avoid"],
 "money": "today's spending limit in £ and why",
 "schedule": [{"time": "09:00", "what": "..."}]}
3 non-negotiables, up to 4 should-dos, 1-2 avoids, 3-6 schedule blocks around calendar events.`,
  week: (p) => `Plan the week starting Monday ${p}. Build on the year plan if there is one, and on deadlines coming up.
Reply with only JSON:
{"theme": "the week in one line",
 "goals": [{"title": "measurable weekly goal", "area": "growth|fitness|mind|money|work", "measure": "how we'll know it's done"}],
 "money": "this week's money target in £",
 "watch": "the one risk this week"}
3 to 5 goals, covering growth, fitness, money and mind where it makes sense.`,
  year: (p) => `Plan the next 12 months starting ${p}. Anchor it on hard deadlines (visa, course, debts), money needs and their goals.
Reply with only JSON:
{"vision": "where they should be in a year, in two sentences",
 "milestones": [{"by": "YYYY-MM-DD", "title": "concrete milestone", "area": "growth|fitness|mind|money|work"}],
 "principles": ["short rule to live by this year"]}
6 to 10 milestones in date order, 3 principles.`,
  money: (p) => `Write the money plan for the month around ${p}. Use real balances, income, spending by category, debts and upcoming bills.
If income is unknown, say so and plan from what is known. Include saving for big upcoming costs (like visa fees) by their due dates.
Reply with only JSON:
{"summary": "the money situation in two sentences",
 "month": {"income": 0, "fixed": 0, "upcoming": 0, "flexible": 0},
 "safe_per_day": 0,
 "save_per_week": 0,
 "rules": ["simple money rule"],
 "debt": "which debt to pay first and how much"}
Numbers are £ per month except safe_per_day and save_per_week. 3 rules.`,
};

export async function makePlan(db: SupabaseClient, kind: PlanKind, period: string, userId?: string) {
  let extra = "";
  if (kind !== "year") {
    let q = db.from("plans").select("kind, period, content").in("kind", ["year", "week"]).order("created_at", { ascending: false }).limit(2);
    if (userId) q = q.eq("user_id", userId);
    const { data } = await q;
    for (const p of data ?? []) extra += `\n\n## Current ${p.kind} plan (${p.period})\n${JSON.stringify(p.content).slice(0, 1500)}`;
  }
  const raw = await chat(SYSTEM, `${await buildContext(db, userId)}${extra}\n\n${ASK[kind](period)}`);
  const content = parseJson<Record<string, unknown>>(raw);
  if (!content) throw new Error("The AI gave an unreadable plan. Try again.");
  const { error } = await db.from("plans").upsert({ ...(userId ? { user_id: userId } : {}), kind, period, content, created_at: new Date().toISOString() }, { onConflict: "user_id,kind,period" });
  if (error) throw new Error(error.message);
  return content;
}
