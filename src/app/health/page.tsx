"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { daysAgo } from "@/lib/dates";
import { buildHealthDays, buildSleepSamples, type HealthDay } from "@/lib/samsung";
import Bars from "@/components/Bars";
import SleepPanel from "@/components/SleepPanel";
import QuitCard from "@/components/QuitCard";
import Link from "next/link";

const hm = (mins: number) => `${Math.floor(mins / 60)}h ${String(Math.round(mins % 60)).padStart(2, "0")}m`;
const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

export default function HealthPage() {
  const [days, setDays] = useState<HealthDay[]>([]);
  const [status, setStatus] = useState("");
  const [range, setRange] = useState(30);
  const [sleepKey, setSleepKey] = useState(0);

  const load = useCallback(async () => {
    const { data } = await supabase.from("health_days").select("*").gte("day", daysAgo(365)).order("day");
    setDays(data ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function importFiles(list: FileList | null) {
    if (!list?.length) return;
    setStatus("Reading files…");
    const files = await Promise.all(
      [...list].filter((f) => f.name.endsWith(".csv")).map(async (f) => ({ name: f.name, text: await f.text() })),
    );
    const rows = buildHealthDays(files);
    if (!rows.length) return setStatus("No health data found. Pick the CSV files from your Samsung Health export.");
    setStatus(`Saving ${rows.length} days…`);
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200).map((r) => ({ ...r, updated_at: new Date().toISOString() }));
      const { error } = await supabase.from("health_days").upsert(chunk, { onConflict: "user_id,day" });
      if (error) return setStatus(`Error: ${error.message}`);
    }
    // Exact sleep times too, so the body clock and wake-ups work on your history.
    const sleep = buildSleepSamples(files);
    for (let i = 0; i < sleep.length; i += 500) {
      const { error } = await supabase.from("health_samples").upsert(sleep.slice(i, i + 500), { onConflict: "user_id,type,start_time,end_time", ignoreDuplicates: true });
      if (error) {
        setStatus(`Imported ${rows.length} days. Sleep times need supabase/007_sleep_agent.sql run once in Supabase.`);
        return load();
      }
    }
    setStatus(`Imported ${rows.length} days (${rows[0].day} to ${rows[rows.length - 1].day})${sleep.length ? ` and ${sleep.filter((x) => x.type === "sleep").length} nights of sleep` : ""}.`);
    setSleepKey((k) => k + 1);
    load();
  }

  const window = Array.from({ length: range }, (_, i) => daysAgo(range - 1 - i));
  const byDay = new Map(days.map((d) => [d.day, d]));
  const series = (k: keyof HealthDay) => window.map((day) => ({ label: day, value: (byDay.get(day)?.[k] as number | null) ?? null }));
  const last7 = window.slice(-7).map((d) => byDay.get(d));

  const steps7 = avg(last7.map((d) => d?.steps ?? null));
  const sleep7 = avg(last7.map((d) => d?.sleep_min ?? null));
  const stress7 = avg(last7.map((d) => d?.stress_avg ?? null));
  const hr7 = avg(last7.map((d) => d?.hr_min ?? null));
  const latest = days.at(-1)?.day;

  return (
    <div className="stagger space-y-4">
      <h1 className="text-[1.7rem] font-semibold tracking-tight">Body</h1>
      <SleepPanel key={sleepKey} />
      <QuitCard />
      <Link href="/habits" className="card card-link flex items-center justify-between text-sm">
        <span>✅ Habits you&apos;re building and breaking</span>
        <span className="muted">→</span>
      </Link>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Steps / day (7d)" value={steps7 === null ? "–" : Math.round(steps7).toLocaleString("en-GB")} />
        <Stat label="Sleep / night (7d)" value={sleep7 === null ? "–" : hm(sleep7)} />
        <Stat label="Stress (7d)" value={stress7 === null ? "–" : String(Math.round(stress7))} />
        <Stat label="Lowest HR (7d)" value={hr7 === null ? "–" : `${Math.round(hr7)} bpm`} />
      </div>

      <div className="flex gap-2">
        {[7, 30, 90].map((r) => (
          <button key={r} onClick={() => setRange(r)} className={`chip flex-1 ${range === r ? "chip-on" : ""}`}>
            {r} days
          </button>
        ))}
      </div>

      <Chart title="Steps" hint="Dashed line = 8,000">
        <Bars data={series("steps")} target={8000} format={(v) => v.toLocaleString("en-GB")} />
      </Chart>
      <Chart title="Sleep" hint="Dashed line = 7h">
        <Bars data={series("sleep_min")} target={420} format={hm} color="bg-indigo-500" />
      </Chart>
      <Chart title="Exercise minutes">
        <Bars data={series("exercise_min")} format={(v) => `${v} min`} color="bg-orange-500" />
      </Chart>
      <Chart title="Stress" hint="Lower is better">
        <Bars data={series("stress_avg")} color="bg-rose-500" />
      </Chart>

      <details className="card group">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm">
          <span>⌚ Watch sync and Samsung Health import</span>
          <span className="text-xs muted transition group-open:rotate-180">⌄</span>
        </summary>
        <div className="mt-3 space-y-2">
          <Link href="/me" className="block text-sm text-emerald-600 underline dark:text-emerald-400">Live watch sync settings (Me page)</Link>
          <p className="text-xs muted">
            Samsung Health → ⋮ → Settings → Download personal data. Move the folder to this device, then select all the CSV files inside it.
            Re-importing is safe: days are updated, never duplicated. Your sleep history also fills in your body clock.
          </p>
          <label className="btn block cursor-pointer text-center">
            Choose CSV files
            <input type="file" accept=".csv" multiple className="hidden" onChange={(e) => importFiles(e.target.files)} />
          </label>
          {status && <p className="text-sm muted">{status}</p>}
          {latest && <p className="text-xs muted">Latest data: {latest}</p>}
        </div>
      </details>
    </div>
  );
}

function Chart({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="label mb-0">{title}</p>
        {hint && <span className="text-xs muted">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card text-center">
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-xs muted">{label}</p>
    </div>
  );
}
