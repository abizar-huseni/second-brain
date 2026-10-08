// Turns a Samsung Health "Download personal data" export into one row per day.
// Everything runs in the browser: files go straight from your device to your own database.

export type HealthDay = {
  day: string;
  steps: number | null;
  distance_km: number | null;
  active_min: number | null;
  calories: number | null;
  exercise_min: number | null;
  workouts: number | null;
  sleep_min: number | null;
  sleep_score: number | null;
  hr_avg: number | null;
  hr_min: number | null;
  stress_avg: number | null;
};

type Table = { headers: string[]; rows: string[][] };

// Samsung CSVs: line 1 is metadata, line 2 is the header, then data rows (with a trailing comma).
export function parseSamsungCsv(text: string): Table {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.length);
  const split = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = !quoted;
      } else if (ch === "," && !quoted) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out;
  };
  return { headers: lines.length > 1 ? split(lines[1]) : [], rows: lines.slice(2).map(split) };
}

// Columns are sometimes prefixed, e.g. "com.samsung.health.sleep.start_time".
function getter(t: Table, name: string) {
  const i = t.headers.findIndex((h) => h === name || h.endsWith("." + name));
  return (row: string[]) => (i >= 0 ? row[i] ?? "" : "");
}

const num = (s: string) => (s === "" || isNaN(Number(s)) ? null : Number(s));

// "2026-07-24 03:00:00.000" (UTC) + "UTC+0100" -> local "2026-07-24"
function localDay(utc: string, offset: string): string | null {
  if (!utc) return null;
  const t = Date.parse(utc.replace(" ", "T") + "Z");
  if (isNaN(t)) return null;
  const m = offset.match(/UTC([+-])(\d{2})(\d{2})/);
  const shift = m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60000 : 0;
  return new Date(t + shift).toISOString().slice(0, 10);
}

const minutesBetween = (a: string, b: string) =>
  (Date.parse(b.replace(" ", "T") + "Z") - Date.parse(a.replace(" ", "T") + "Z")) / 60000;

type Acc = HealthDay & { _hr: number[]; _stress: number[] };

export function buildHealthDays(files: { name: string; text: string }[]): HealthDay[] {
  const days = new Map<string, Acc>();
  const get = (day: string): Acc => {
    let d = days.get(day);
    if (!d) {
      d = {
        day, steps: null, distance_km: null, active_min: null, calories: null, exercise_min: null, workouts: null,
        sleep_min: null, sleep_score: null, hr_avg: null, hr_min: null, stress_avg: null, _hr: [], _stress: [],
      };
      days.set(day, d);
    }
    return d;
  };
  const max = (a: number | null, b: number | null) => (b === null ? a : a === null ? b : Math.max(a, b));

  for (const f of files) {
    const n = f.name;
    const t = parseSamsungCsv(f.text);
    const col = (name: string) => getter(t, name);

    if (n.includes("activity.day_summary")) {
      const [dayTime, steps, dist, active, cal] = ["day_time", "step_count", "distance", "active_time", "calorie"].map(col);
      for (const r of t.rows) {
        const day = dayTime(r).slice(0, 10);
        if (!day) continue;
        const d = get(day);
        // Several devices can report the same day; keep the fullest record.
        if ((num(steps(r)) ?? 0) >= (d.steps ?? -1)) {
          d.steps = num(steps(r));
          d.distance_km = num(dist(r)) !== null ? Math.round(num(dist(r))! / 10) / 100 : null;
          d.active_min = num(active(r)) !== null ? Math.round(num(active(r))! / 60000) : null;
          d.calories = num(cal(r)) !== null ? Math.round(num(cal(r))!) : null;
        }
      }
    } else if (n.includes("step_daily_trend")) {
      const [dayTime, count, source] = ["day_time", "count", "source_type"].map(col);
      for (const r of t.rows) {
        const day = dayTime(r).slice(0, 10);
        // source_type -2 = all devices combined
        if (day && source(r) === "-2") get(day).steps = max(get(day).steps, num(count(r)));
      }
    } else if (/\.shealth\.sleep\.\d/.test(n)) {
      const [start, end, offset, score] = ["start_time", "end_time", "time_offset", "sleep_score"].map(col);
      for (const r of t.rows) {
        const day = localDay(end(r), offset(r)); // a night counts for the day you wake up
        const mins = minutesBetween(start(r), end(r));
        if (!day || !(mins > 0) || mins > 16 * 60) continue;
        const d = get(day);
        d.sleep_min = Math.round((d.sleep_min ?? 0) + mins);
        d.sleep_score = max(d.sleep_score, num(score(r)));
      }
    } else if (n.includes("tracker.heart_rate")) {
      const [start, offset, hr] = ["start_time", "time_offset", "heart_rate"].map(col);
      for (const r of t.rows) {
        const day = localDay(start(r), offset(r));
        const v = num(hr(r));
        if (day && v && v > 25 && v < 230) get(day)._hr.push(v);
      }
    } else if (/\.shealth\.stress\.\d/.test(n)) {
      const [start, offset, score] = ["start_time", "time_offset", "score"].map(col);
      for (const r of t.rows) {
        const day = localDay(start(r), offset(r));
        const v = num(score(r));
        if (day && v !== null) get(day)._stress.push(v);
      }
    } else if (/\.shealth\.exercise\.\d/.test(n)) {
      const [start, offset, duration] = ["start_time", "time_offset", "duration"].map(col);
      for (const r of t.rows) {
        const day = localDay(start(r), offset(r));
        const ms = num(duration(r));
        if (!day || !ms) continue;
        const d = get(day);
        d.exercise_min = Math.round((d.exercise_min ?? 0) + ms / 60000);
        d.workouts = (d.workouts ?? 0) + 1;
      }
    }
  }

  return [...days.values()]
    .map(({ _hr, _stress, ...d }) => ({
      ...d,
      hr_avg: _hr.length ? Math.round(_hr.reduce((a, b) => a + b, 0) / _hr.length) : null,
      hr_min: _hr.length ? Math.min(..._hr) : null,
      stress_avg: _stress.length ? Math.round(_stress.reduce((a, b) => a + b, 0) / _stress.length) : null,
    }))
    .sort((a, b) => a.day.localeCompare(b.day));
}
