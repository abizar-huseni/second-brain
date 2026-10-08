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
    // Postgres accepts 'infinity' and 'epoch', so only real dates get through, stored as ISO.
    if (!Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end))) return;
    out.push({ type, start_time: new Date(start).toISOString(), end_time: new Date(end).toISOString(), value, value_min });
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
    if (typeof end !== "string" || !Number.isFinite(Date.parse(end)) || !isFinite(secs)) continue;
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

// The sample types daysFromSamples reads.
export const DAY_TYPES = ["steps", "distance", "active_calories", "exercise", "sleep", "heart_rate", "resting_heart_rate"];

// Adds up a flow (steps, metres, kcal) without double counting. Two apps can send the same walk
// (one as a single long record, the other minute by minute), and a revised record is stored again
// with its new end_time, so records that overlap are never both counted: it keeps the set of
// non-overlapping records with the largest total. One app's own records don't overlap, so this is
// at least the fuller app's total. Each kept record counts for its start day, as before.
function addOverTime(samples: Sample[], add: (day: string, v: number) => void) {
  const recs = samples
    .map((s) => {
      const a = Date.parse(s.start_time);
      const b = Math.max(Date.parse(s.end_time), a + 1000); // zero-length counts as 1 second
      return { a, b, v: Number(s.value), day: localDay(s.start_time) };
    })
    .filter((r) => Number.isFinite(r.a) && Number.isFinite(r.b) && Number.isFinite(r.v))
    .sort((x, y) => x.b - y.b);
  // best[i]: largest total from the first i records (by end); prev[i]: how many of those end by record i's start.
  const best = [0];
  const prev: number[] = [];
  for (let i = 0; i < recs.length; i++) {
    let lo = 0;
    let hi = i;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (recs[mid].b <= recs[i].a) lo = mid + 1;
      else hi = mid;
    }
    prev.push(lo);
    best.push(Math.max(best[i], best[lo] + recs[i].v));
    add(recs[i].day, 0); // a day with records always gets the field
  }
  for (let i = recs.length; i > 0; ) {
    if (best[i] === best[i - 1]) i--;
    else {
      add(recs[i - 1].day, recs[i - 1].v);
      i = prev[i - 1];
    }
  }
}

// Aggregates raw samples into per-day fields. Only fields with data are set,
// so live data never wipes out what a CSV import filled in.
export function daysFromSamples(samples: Sample[]): DayPatch[] {
  const days = new Map<string, DayPatch & { _hr: number[]; _hrMin: number[]; _rhr: number[]; _sleep: Session[] }>();
  const get = (day: string) => {
    let d = days.get(day);
    if (!d) days.set(day, (d = { day, _hr: [], _hrMin: [], _rhr: [], _sleep: [] }));
    return d;
  };
  const flows: Record<"steps" | "distance" | "active_calories", Sample[]> = { steps: [], distance: [], active_calories: [] };
  for (const s of samples) {
    const v = Number(s.value);
    switch (s.type) {
      case "steps":
      case "distance":
      case "active_calories":
        flows[s.type].push(s);
        break;
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
  addOverTime(flows.steps, (day, v) => {
    const d = get(day);
    d.steps = (d.steps ?? 0) + v;
  });
  addOverTime(flows.distance, (day, v) => {
    const d = get(day);
    d.distance_km = (d.distance_km ?? 0) + v / 1000;
  });
  addOverTime(flows.active_calories, (day, v) => {
    const d = get(day);
    d.calories = (d.calories ?? 0) + v;
  });
  const min = (xs: number[]) => xs.reduce((a, b) => Math.min(a, b));
  return [...days.values()].map(({ _hr, _hrMin, _rhr, _sleep, ...d }) => {
    if (_sleep.length) d.sleep_min = Math.round(mergeSessions(_sleep).reduce((t, x) => t + x.asleep_s, 0) / 60);
    if (_hr.length) d.hr_avg = Math.round(_hr.reduce((a, b) => a + b, 0) / _hr.length);
    if (_rhr.length) d.hr_min = Math.round(min(_rhr));
    else if (_hrMin.length) d.hr_min = Math.round(min(_hrMin));
    if (d.steps !== undefined) d.steps = Math.round(d.steps);
    if (d.distance_km !== undefined) d.distance_km = Math.round(d.distance_km * 100) / 100;
    if (d.calories !== undefined) d.calories = Math.round(d.calories);
    return d;
  });
}
