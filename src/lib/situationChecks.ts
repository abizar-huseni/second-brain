// Server-only: fixed daily checks on your dissertation, work hours and visa. They don't wait for the AI
// to notice: each writes one insight (refreshed in place, not repeated) and says when a push is due.
import type { SupabaseClient } from "@supabase/supabase-js";
import { SITUATION_COLS, GRAD_CUTOFF, GRAD_URL, WORK_RULES_URL, daysBetween, fmtDay, gradCost, inTerm, mondayOf, plural, type Situation } from "./situation";

type Check = { key: string; prefix: string; title: string; body: string; priority: 1 | 2; source: { title: string; url: string } | null; push: boolean };
export type Push = { key: string; title: string; body: string; url: string };

const GRAD_SRC = { title: "GOV.UK: Graduate visa", url: GRAD_URL };
const WORK_SRC = { title: "GOV.UK: Immigration Rules, Appendix Student (ST 26)", url: WORK_RULES_URL };

export function checksFor(s: Situation, today: string, weekHours: number): Check[] {
  const out: Check[] = [];
  const monday = mondayOf(today) === today;

  // 1. Dissertation countdown.
  if (s.dissertation_due) {
    const left = daysBetween(today, s.dissertation_due);
    if (left >= 0 && left <= 60) {
      const close = left <= 14;
      out.push({
        key: "dissertation",
        prefix: "Dissertation:",
        title: `Dissertation: ${left === 0 ? "due today" : `${plural(left, "day")} left`}`,
        body: left === 0 ? "Hand it in today. Everything else can wait." : `Due ${fmtDay(s.dissertation_due)}. ${close ? "Protect a focused block every day until it's in, and plan the final read-through and submission now." : "Keep a dissertation block in every day's plan."}`,
        priority: close ? 1 : 2,
        source: null,
        push: close || monday,
      });
    }
  }

  // 2. Work hours against the term-time limit.
  if (inTerm(s, today) && weekHours > 0) {
    const limit = s.term_work_limit || 20;
    const over = weekHours > limit;
    if (weekHours >= limit - 4) {
      out.push({
        key: "work-hours",
        prefix: "Work hours:",
        title: `Work hours: ${weekHours}h of ${limit} this week`,
        body: over
          ? `You've logged ${weekHours} hours since Monday. The Student visa allows ${limit} a week in term time, so stop taking shifts until Monday and check what you've agreed to.`
          : `${limit - weekHours}h left before the ${limit}-hour term-time limit (Monday to Sunday). Check your shifts before you accept more.`,
        priority: over || weekHours >= limit - 2 ? 1 : 2,
        source: WORK_SRC,
        push: weekHours >= limit - 2,
      });
    }
  }

  // 3. When to apply for the Graduate visa.
  if (s.grad_plan !== "no" && s.visa_expiry && s.course_end) {
    const toExpiry = daysBetween(today, s.visa_expiry);
    const toCourseEnd = daysBetween(today, s.course_end);
    const toCutoff = daysBetween(today, GRAD_CUTOFF);
    const { years, total } = gradCost(today);
    const cost = `£${Math.round(total).toLocaleString("en-GB")} (£937 fee plus the health surcharge for ${years === 2 ? "2 years" : "18 months"})`;
    const by = toCutoff >= 0 && s.visa_expiry > GRAD_CUTOFF ? `Apply by ${fmtDay(GRAD_CUTOFF)} to get 2 years instead of 18 months.` : "";
    if (toExpiry >= 0 && toCourseEnd <= 30) {
      const urgent = toExpiry <= 30 || (toCutoff >= 0 && toCutoff <= 21 && s.visa_expiry > GRAD_CUTOFF);
      const after = toCourseEnd < 0;
      out.push({
        key: "graduate-visa",
        prefix: "Graduate visa:",
        title: after ? `Graduate visa: apply before ${fmtDay(s.visa_expiry)}` : "Graduate visa: get ready to apply",
        body: `${after ? "Apply as soon as your university has told the Home Office you've completed." : `Your course ends ${fmtDay(s.course_end)}. You can apply once your university reports that you've completed.`} You must apply from inside the UK before your Student visa ends (${plural(toExpiry, "day")} away). ${by} Cost about ${cost}.`.replace(/\s+/g, " "),
        priority: after || urgent ? 1 : 2,
        source: GRAD_SRC,
        push: urgent || (after && monday),
      });
    }
  }
  return out;
}

// Runs the checks, keeps one live insight per check, and returns the pushes due today.
export async function situationChecks(db: SupabaseClient, userId: string, today: string, pushedToday: Record<string, string>): Promise<Push[]> {
  const { data, error } = await db.from("profile").select(SITUATION_COLS).eq("user_id", userId).maybeSingle();
  if (error || !data) return [];
  const s = data as unknown as Situation;

  const monday = mondayOf(today);
  const { data: rows } = await db.from("checkins").select("hours_worked").eq("user_id", userId).gte("day", monday).lte("day", today);
  const weekHours = Math.round((rows ?? []).reduce((t, r) => t + Number(r.hours_worked ?? 0), 0) * 10) / 10;

  const pushes: Push[] = [];
  const since = new Date(Date.now() - 20 * 3600 * 1000).toISOString();
  for (const c of checksFor(s, today, weekHours)) {
    const { data: existing } = await db.from("insights").select("id, status, created_at").eq("user_id", userId).like("title", `${c.prefix}%`).order("created_at", { ascending: false }).limit(1);
    const last = existing?.[0];
    // Dismissed or done today: leave it until tomorrow.
    if (last && last.status !== "new" && last.created_at >= since) continue;
    const row = { title: c.title, body: c.body, priority: c.priority, kind: "deadline", sources: c.source ? [c.source] : null, created_at: new Date().toISOString() };
    if (last?.status === "new") await db.from("insights").update(row).eq("id", last.id);
    else await db.from("insights").insert({ ...row, user_id: userId });
    if (c.push && pushedToday[c.key] !== today) pushes.push({ key: c.key, title: `⏰ ${c.title}`, body: c.body.slice(0, 180), url: "/" });
  }
  return pushes;
}
