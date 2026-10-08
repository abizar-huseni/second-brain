"use client";
// A small countdown to your next big date (dissertation, course end, visa). Hidden until you confirm them on You.
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { lday } from "@/lib/ldates";
import { SITUATION_COLS, daysBetween, fmtDay, type Situation } from "@/lib/situation";

export default function DeadlineCountdown() {
  const [s, setS] = useState<Situation | null>(null);

  useEffect(() => {
    supabase
      .from("profile")
      .select(SITUATION_COLS)
      .maybeSingle()
      .then(({ data, error }) => !error && setS(data as unknown as Situation | null));
  }, []);

  if (!s?.situation_confirmed_at) return null;
  const today = lday();
  const next = [
    { label: "Dissertation", icon: "📝", d: s.dissertation_due },
    { label: "Course ends", icon: "🎓", d: s.course_end },
    { label: "Student visa ends", icon: "🛂", d: s.visa_expiry },
  ]
    .filter((x): x is { label: string; icon: string; d: string } => !!x.d && daysBetween(today, x.d) >= 0)
    .sort((a, b) => a.d.localeCompare(b.d))[0];
  if (!next) return null;

  const left = daysBetween(today, next.d);
  // The bar fills over the last 60 days.
  const pct = Math.max(4, Math.min(100, Math.round(((60 - Math.min(left, 60)) / 60) * 100)));
  const tone = left <= 7 ? "text-rose-500" : left <= 21 ? "text-amber-500" : "text-[var(--accent)]";

  return (
    <Link href="/me#situation" className="card card-link flex items-center gap-3 py-3">
      <span className="text-2xl">{next.icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-medium">{next.label}</p>
          <p className={`text-lg font-semibold tabular-nums ${tone}`}>{left === 0 ? "Today" : `${left}d`}</p>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
          <div className="accent-fill h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-[11px] text-zinc-500">{fmtDay(next.d)}</p>
      </div>
    </Link>
  );
}
