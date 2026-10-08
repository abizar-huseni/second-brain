"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { lday, addDays } from "@/lib/ldates";
import { inTerm, mondayOf, SITUATION_COLS, type Situation } from "@/lib/situation";

export type Logged = { day: string; hours: number }[];

const WEEKS = 8;
const fmtWeek = (monday: string) => new Date(`${monday}T12:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

// Hours you logged in night check-ins, Monday to Sunday, against the term-time limit
// (the same weeks and limit the brain's daily work-hours check uses).
export default function WorkHours({ logged }: { logged: Logged }) {
  const [s, setS] = useState<Situation | null>(null);
  useEffect(() => {
    supabase
      .from("profile")
      .select(SITUATION_COLS)
      .maybeSingle()
      .then(({ data, error }) => !error && setS(data as unknown as Situation | null));
  }, []);

  const today = lday();
  const thisMonday = mondayOf(today);
  const limit = s?.term_work_limit || 20;
  const term = s ? inTerm(s, today) : false;
  const weeks = Array.from({ length: WEEKS }, (_, i) => {
    const monday = addDays(thisMonday, -7 * (WEEKS - 1 - i));
    const sunday = addDays(monday, 6);
    const hours = logged.filter((l) => l.day >= monday && l.day <= sunday).reduce((t, l) => t + l.hours, 0);
    return { monday, hours: Math.round(hours * 10) / 10 };
  });
  const now = weeks[weeks.length - 1].hours;
  const max = Math.max(limit, ...weeks.map((w) => w.hours), 1);
  const tone = (h: number) => (h > limit ? "bg-rose-500" : h >= limit - 4 ? "bg-amber-400" : "accent-fill");

  return (
    <div className="card space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="label">💼 This week · Mon to Sun</p>
          <p className="text-3xl font-semibold tabular-nums">
            {now}h <span className="text-base font-normal text-zinc-500">of {limit}</span>
          </p>
          <p className={`text-xs ${now > limit ? "text-rose-500" : now >= limit - 4 ? "text-amber-600 dark:text-amber-400" : "text-zinc-500"}`}>
            {now > limit
              ? `${Math.round((now - limit) * 10) / 10}h over the ${limit}-hour limit`
              : `${Math.round((limit - now) * 10) / 10}h left before ${limit}h${term ? " (term-time visa limit)" : ""}`}
          </p>
        </div>
        <p className="text-right text-[11px] text-zinc-500">From night check-ins</p>
      </div>
      <div className="relative flex h-32 items-end gap-2 pt-2">
        <div className="absolute inset-x-0 border-t border-dashed border-rose-400/70" style={{ bottom: `${(limit / max) * 0.7 * 120 + 16}px` }}>
          <span className="absolute -top-4 right-0 text-[10px] text-rose-500">{limit}h</span>
        </div>
        {weeks.map((w, i) => (
          <div key={w.monday} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[10px] tabular-nums text-zinc-500">{w.hours || ""}</span>
            <div
              title={`Week of ${fmtWeek(w.monday)}: ${w.hours}h`}
              className={`grow-bar w-full rounded-lg ${w.hours ? tone(w.hours) : "bg-zinc-500/15"} ${i === weeks.length - 1 ? "ring-2 ring-[var(--accent)]/40" : ""}`}
              style={{ height: `${w.hours ? Math.max(4, (w.hours / max) * 70) : 3}%`, animationDelay: `${i * 40}ms` }}
            />
            <span className="h-3 text-[10px] text-zinc-500">{fmtWeek(w.monday).split(" ")[0]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
