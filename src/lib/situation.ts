// Your course, dissertation and visa dates (profile fields, confirmed on the You page) and the fixed
// rules that go with them. Shared by the app, the daily checks and the AI context. Rules checked on GOV.UK.

export type Situation = {
  course_end: string | null;
  dissertation_due: string | null;
  visa_type: string;
  visa_expiry: string | null;
  grad_plan: string; // apply | unsure | no
  term_work_limit: number;
  situation_confirmed_at: string | null;
};

export const SITUATION_COLS = "course_end, dissertation_due, visa_type, visa_expiry, grad_plan, term_work_limit, situation_confirmed_at";

export const GRAD_URL = "https://www.gov.uk/graduate-visa";
export const WORK_RULES_URL = "https://www.gov.uk/guidance/immigration-rules/immigration-rules-appendix-student";

// Graduate visa: 2 years if you apply on or before this date, 18 months after it.
export const GRAD_CUTOFF = "2026-12-31";
const GRAD_FEE = 937;
const IHS_YEAR = 1035;

const noon = (d: string) => Date.parse(`${d}T12:00:00Z`);
export const daysBetween = (from: string, to: string) => Math.round((noon(to) - noon(from)) / 86400000);
export const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(noon(v));

export function addMonths(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + n, Math.min(d, last), 12)).toISOString().slice(0, 10);
}

// Monday of the week a day falls in (weeks run Monday to Sunday).
export function mondayOf(day: string): string {
  const dow = (new Date(noon(day)).getUTCDay() + 6) % 7;
  return new Date(noon(day) - dow * 86400000).toISOString().slice(0, 10);
}

export function gradCost(applyOn: string) {
  const years = applyOn <= GRAD_CUTOFF ? 2 : 1.5;
  return { years, total: GRAD_FEE + IHS_YEAR * years };
}

export const fmtDay = (d: string) => new Date(noon(d)).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

// Still in term time for the work limit? Without term dates, the course counts as term time until it ends.
export const inTerm = (s: Pick<Situation, "visa_type" | "course_end">, today: string) => s.visa_type === "student" && !!s.course_end && today <= s.course_end;

// Lines for the AI's context. These are confirmed facts, so plans are built around them.
export function situationLines(s: Situation, today: string): string[] {
  const out: string[] = [];
  if (s.dissertation_due) {
    const left = daysBetween(today, s.dissertation_due);
    if (left >= 0) {
      out.push(`Dissertation due ${s.dissertation_due} (${plural(left, "day")} left).`);
      out.push("Until it is handed in, one of tomorrow's non-negotiables is always a focused dissertation block, and nothing else gets planned over it.");
    }
  }
  if (s.course_end) out.push(`Course ends ${s.course_end}.`);
  if (s.visa_type === "student") {
    out.push(
      inTerm(s, today)
        ? `Student visa: at most ${s.term_work_limit} hours of work a week in term time (Monday to Sunday). Never plan or suggest more [nhs:student-work].`
        : "Student visa: the course has ended, so full-time work is allowed until the visa expires [nhs:student-work].",
    );
  }
  if (s.visa_expiry) out.push(`Student visa expires ${s.visa_expiry} (${plural(daysBetween(today, s.visa_expiry), "day")} away).`);
  if (s.grad_plan === "apply" && s.visa_expiry)
    out.push(`They plan to apply for the Graduate visa: from inside the UK, after the university reports completion and before ${s.visa_expiry}. Apply by ${GRAD_CUTOFF} for 2 years. Cost about £${Math.round(gradCost(today).total).toLocaleString("en-GB")} [nhs:graduate-visa].`);
  return out;
}
