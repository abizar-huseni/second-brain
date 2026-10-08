"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { daysAgo } from "@/lib/dates";
import { buildHealthDays, type HealthDay } from "@/lib/samsung";
import Bars from "@/components/Bars";

const hm = (mins: number) => `${Math.floor(mins / 60)}h ${String(Math.round(mins % 60)).padStart(2, "0")}m`;
const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

export default function HealthPage() {
  const [days, setDays] = useState<HealthDay[]>([]);
  const [status, setStatus] = useState("");
  const [range, setRange] = useState(30);

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
    setStatus(`Imported ${rows.length} days (${rows[0].day} to ${rows[rows.length - 1].day}).`);
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
    <div className="space-y-4">
      <div className="card space-y-2">
        <p className="label">Import from Samsung Health</p>
        <p className="text-xs text-zinc-500">
          Samsung Health → ⋮ → Settings → Download personal data. Move the folder to this device, then select all the CSV files inside it.
          Re-importing is safe: days are updated, never duplicated.
        </p>
        <label className="btn block cursor-pointer text-center">
          Choose CSV files
          <input type="file" accept=".csv" multiple className="hidden" onChange={(e) => importFiles(e.target.files)} />
        </label>
        {status && <p className="text-sm text-zinc-500">{status}</p>}
        {latest && <p className="text-xs text-zinc-500">Latest data: {latest}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Steps / day (7d)" value={steps7 === null ? "–" : Math.round(steps7).toLocaleString("en-GB")} />
        <Stat label="Sleep / night (7d)" value={sleep7 === null ? "–" : hm(sleep7)} />
        <Stat label="Stress (7d)" value={stress7 === null ? "–" : String(Math.round(stress7))} />
        <Stat label="Lowest HR (7d)" value={hr7 === null ? "–" : `${Math.round(hr7)} bpm`} />
      </div>

      <div className="flex gap-2">
        {[7, 30, 90].map((r) => (
          <button key={r} onClick={() => setRange(r)} className={`flex-1 rounded-lg py-1.5 text-sm ${range === r ? "btn" : "border border-zinc-300 dark:border-zinc-700"}`}>
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
    </div>
  );
}

function Chart({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="label mb-0">{title}</p>
        {hint && <span className="text-xs text-zinc-500">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card text-center">
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-zinc-500">{label}</p>
    </div>
  );
}
