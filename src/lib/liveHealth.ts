// Turns HC Webhook payloads (Health Connect JSON) into raw samples and daily rows.
// Docs: https://github.com/mcnaveen/health-connect-webhook/blob/main/docs/webhook.md

import { mergeSessions, type Session } from "./sleep";

export type Sample = { type: string; start_time: string; end_time: string; value: number; value_min: number | null };

type Rec = Record<string, unknown>;
const n = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v !== "" ? Number(v) : NaN);
const arr = (p: Rec, k: string) => (Array.isArray(p[k]) ? (p[k] as Rec[]) : []);

export function samplesFromPayload(p: Rec): Sample[] {
  const out: Sample[] = [];
  const push = (type: string, start: unknown, end: unknown, value: number, value_min: number | null = null) => {
    if (typeof start !== "string" || typeof end !== "string" || !isFinite(value)) return;
    out.push({ type, start_time: start, end_time: end, value, value_min });
  };

  for (const r of arr(p, "steps")) push("steps", r.start_time, r.end_time, n(r.count));
  for (const r of arr(p, "active_calories")) push("active_calories", r.start_time, r.end_time, n(r.calories));
  for (const r of arr(p, "distance")) push("distance", r.start_time, r.end_time, n(r.distance_meters ?? r.meters ?? r.distance));
  for (const r of arr(p, "exercise")) push("exercise", r.start_time, r.end_time, n(r.duration_seconds));
  for (const r of arr(p, "resting_heart_rate")) push("resting_heart_rate", r.time, r.time, n(r.bpm));
  for (const r of arr(p, "heart_rate")) {
    const avg = n(r.avg ?? r.bpm);
    push("heart_rate", r.time, r.time, avg, isFinite(n(r.min)) ? n(r.min) : avg);
  }
  for (const r of arr(p, "sleep")) {
    const secs = n(r.duration_seconds);
    const end = r.session_end_time;
    if (typeof end !== "string" || !isFinite(secs)) continue;
    // Count only time actually asleep when stages are present, and keep each awake spell
    // so the Sleep card can show wake-ups in the night.
    const stages = Array.isArray(r.stages) ? (r.stages as Rec[]) : [];
    let asleep = 0;
    for (const s of stages) {
      const d = n(s.duration_seconds) || 0;
      if (isAwakeStage(s.stage)) {
        if (d >= 60) push("awake", s.start_time, s.end_time, d);
      } else asleep += d;
    }
    const start = typeof r.session_start_time === "string" ? r.session_start_time : new Date(Date.parse(end) - secs * 1000).toISOString();
    push("sleep", start, end, stages.length ? asleep : secs);
  }
  return out;
}

// Health Connect sends the stage as a number: 1 awake, 3 out of bed, 7 awake in bed
// (0 unknown, 2 sleeping, 4 light, 5 deep, 6 REM). Older versions sent names.
export function isAwakeStage(stage: unknown) {
  const v = String(stage ?? "").trim().toUpperCase();
  return v === "1" || v === "3" || v === "7" || /AWAKE|OUT_OF_BED/.test(v);
}

export const TZ = "Europe/London";
export const localDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });

export type DayPatch = {
  day: string;
  steps?: number;
  distance_km?: number;
  calories?: number;
  exercise_min?: number;
  workouts?: number;
  sleep_min?: number;
  hr_avg?: number;
  hr_min?: number;
};

// Aggregates raw samples into per-day fields. Only fields with data are set,
// so live data never wipes out what a CSV import filled in.
export function daysFromSamples(samples: Sample[]): DayPatch[] {
  const days = new Map<string, DayPatch & { _hr: number[]; _hrMin: number[]; _rhr: number[]; _sleep: Session[] }>();
  const get = (day: string) => {
    let d = days.get(day);
    if (!d) days.set(day, (d = { day, _hr: [], _hrMin: [], _rhr: [], _sleep: [] }));
    return d;
  };
  for (const s of samples) {
    const v = Number(s.value);
    switch (s.type) {
      case "steps": {
        const d = get(localDay(s.start_time));
        d.steps = (d.steps ?? 0) + v;
        break;
      }
      case "distance": {
        const d = get(localDay(s.start_time));
        d.distance_km = Math.round(((d.distance_km ?? 0) + v / 1000) * 100) / 100;
        break;
      }
      case "active_calories": {
        const d = get(localDay(s.start_time));
        d.calories = Math.round((d.calories ?? 0) + v);
        break;
      }
      case "exercise": {
        const d = get(localDay(s.start_time));
        d.exercise_min = Math.round((d.exercise_min ?? 0) + v / 60);
        d.workouts = (d.workouts ?? 0) + 1;
        break;
      }
      case "sleep": {
        // A night counts for the morning you wake up. The same session can arrive from two apps,
        // so overlapping sessions count once.
        const d = get(localDay(s.end_time));
        d._sleep.push({ start: s.start_time, end: s.end_time, asleep_s: v });
        break;
      }
      case "heart_rate": {
        const d = get(localDay(s.start_time));
        d._hr.push(v);
        d._hrMin.push(Number(s.value_min ?? v));
        break;
      }
      case "resting_heart_rate":
        get(localDay(s.start_time))._rhr.push(v);
        break;
    }
  }
  return [...days.values()].map(({ _hr, _hrMin, _rhr, _sleep, ...d }) => {
    if (_sleep.length) d.sleep_min = Math.round(mergeSessions(_sleep).reduce((t, x) => t + x.asleep_s, 0) / 60);
    if (_hr.length) d.hr_avg = Math.round(_hr.reduce((a, b) => a + b, 0) / _hr.length);
    if (_rhr.length) d.hr_min = Math.round(Math.min(..._rhr));
    else if (_hrMin.length) d.hr_min = Math.round(Math.min(..._hrMin));
    if (d.steps !== undefined) d.steps = Math.round(d.steps);
    return d;
  });
}
