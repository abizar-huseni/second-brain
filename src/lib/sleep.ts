// Sleep debt and body clock, worked out from sleep sessions (watch, Samsung export or manual taps).
// Pure functions: the same maths runs in the browser and in the assistant's context.
import { TZ } from "./ldates";

export type Session = { start: string; end: string; asleep_s: number; manual?: boolean };
export type Awake = { start: string; end: string };

export type Night = {
  day: string; // the morning you woke up (London date)
  bed: string; // ISO
  wake: string; // ISO
  asleepMin: number;
  inBedMin: number;
  wakeups: number | null; // null when the source has no sleep stages
  awakeMin: number | null;
  segments: { start: string; end: string; awake: boolean }[]; // for the night timeline
  manual: boolean;
};

export type Chronotype = { label: string; emoji: string; blurb: string };

export type SleepReport = {
  needMin: number;
  nights: Night[]; // newest first, last 14 nights with data
  lastNight: Night | null;
  debtMin: number; // last 7 nights, catching up counts
  debtNights: number;
  avgAsleepMin: number | null;
  avgBed: number | null; // minutes after midnight, London
  avgWake: number | null;
  avgMid: number | null;
  spreadMin: number | null; // how much your bedtime wanders (circular std dev)
  chronotype: Chronotype | null;
  jetlagMin: number | null; // weekend vs weekday body-clock gap
  wakeupsAvg: number | null;
  wakeHour: number | null; // the hour you most often wake in the night
  bedTonight: number | null; // suggested bedtime, minutes after midnight
  windDown: number | null;
  verdict: string;
  tips: string[]; // keys into nhs.ts
};

const MIN = 60_000;
const HOUR = 60 * MIN;

// Minutes after London midnight for an ISO time.
export function clockMin(iso: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}
const londonDay = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone: TZ });

export const fmtClock = (min: number | null) => {
  if (min === null) return "–";
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
export const fmtDur = (min: number | null) => {
  if (min === null) return "–";
  const m = Math.round(Math.abs(min));
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${String(m % 60).padStart(2, "0")}m` : ""}`;
};

// Average of clock times that wrap around midnight (23:50 and 00:10 average to 00:00, not 12:00).
function circular(mins: number[]): { mean: number; spread: number } | null {
  if (!mins.length) return null;
  const a = mins.map((m) => (m / 1440) * 2 * Math.PI);
  const s = a.reduce((t, x) => t + Math.sin(x), 0) / a.length;
  const c = a.reduce((t, x) => t + Math.cos(x), 0) / a.length;
  const mean = ((Math.atan2(s, c) / (2 * Math.PI)) * 1440 + 1440) % 1440;
  const r = Math.min(1, Math.hypot(s, c));
  const spread = r > 0 ? (Math.sqrt(-2 * Math.log(r)) / (2 * Math.PI)) * 1440 : 720;
  return { mean, spread };
}
const diffClock = (a: number, b: number) => {
  const d = Math.abs(a - b) % 1440;
  return d > 720 ? 1440 - d : d;
};

// A daytime session under 3 hours is a nap, not your night.
const isNap = (s: Session) => {
  const dur = (Date.parse(s.end) - Date.parse(s.start)) / MIN;
  const h = clockMin(s.start) / 60;
  return dur < 180 && h >= 9 && h < 19;
};

// The same night can arrive twice (watch + Samsung export + a manual tap). Overlapping sessions merge,
// keeping the best measured one; separate sessions in one night (woke up, slept again) add up.
export function mergeSessions(sessions: Session[]): Session[] {
  const sorted = [...sessions].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const out: Session[] = [];
  for (const s of sorted) {
    const prev = out.at(-1);
    if (!prev || Date.parse(s.start) >= Date.parse(prev.end) - 5 * MIN) {
      out.push({ ...s });
    } else if (prev.manual !== s.manual) {
      out[out.length - 1] = { ...(prev.manual ? s : prev) }; // the watch beats a manual tap
    } else {
      out[out.length - 1] = {
        start: prev.start,
        end: Date.parse(s.end) > Date.parse(prev.end) ? s.end : prev.end,
        asleep_s: Math.max(prev.asleep_s, s.asleep_s),
        manual: prev.manual,
      };
    }
  }
  return out;
}

// Groups sessions into nights. A night belongs to the morning you wake up.
export function buildNights(sessions: Session[], awakes: Awake[]): Night[] {
  const byDay = new Map<string, Session[]>();
  for (const s of mergeSessions(sessions.filter((x) => Date.parse(x.end) > Date.parse(x.start)))) {
    if (isNap(s)) continue;
    const day = londonDay(Date.parse(s.start) + 6 * HOUR);
    byDay.set(day, [...(byDay.get(day) ?? []), s]);
  }
  const nights: Night[] = [];
  for (const [day, list] of byDay) {
    list.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    const bed = list[0].start;
    const wake = list.reduce((m, s) => (Date.parse(s.end) > Date.parse(m) ? s.end : m), list[0].end);
    const b = Date.parse(bed);
    const w = Date.parse(wake);
    const inBedMin = (w - b) / MIN;
    if (inBedMin < 60 || inBedMin > 16 * 60) continue;

    // Awake periods: stage data from the watch, plus gaps between sessions.
    const segs: { start: number; end: number }[] = awakes
      .map((a) => ({ start: Date.parse(a.start), end: Date.parse(a.end) }))
      .filter((a) => a.start >= b - MIN && a.end <= w + MIN && a.end - a.start >= 2 * MIN);
    for (let i = 1; i < list.length; i++) {
      const gs = Date.parse(list[i - 1].end);
      const ge = Date.parse(list[i].start);
      if (ge - gs >= 10 * MIN) segs.push({ start: gs, end: ge });
    }
    segs.sort((x, y) => x.start - y.start);
    // A wake-up near the very end is just waking up for the day.
    const midNight = segs.filter((x) => w - x.end > 15 * MIN && x.start - b > 15 * MIN);
    const asleepSum = list.reduce((t, s) => t + s.asleep_s, 0) / 60;
    const hasStages = segs.length > 0 || asleepSum < inBedMin * 0.97;
    const allManual = list.every((s) => s.manual);

    const timeline: Night["segments"] = [];
    let cursor = b;
    for (const x of segs) {
      if (x.start > cursor) timeline.push({ start: new Date(cursor).toISOString(), end: new Date(x.start).toISOString(), awake: false });
      timeline.push({ start: new Date(Math.max(x.start, cursor)).toISOString(), end: new Date(x.end).toISOString(), awake: true });
      cursor = Math.max(cursor, x.end);
    }
    if (w > cursor) timeline.push({ start: new Date(cursor).toISOString(), end: wake, awake: false });

    nights.push({
      day,
      bed,
      wake,
      asleepMin: Math.round(Math.min(asleepSum, inBedMin)),
      inBedMin: Math.round(inBedMin),
      wakeups: hasStages && !allManual ? midNight.length : null,
      awakeMin: hasStages && !allManual ? Math.round(midNight.reduce((t, x) => t + (x.end - x.start), 0) / MIN) : null,
      segments: timeline,
      manual: allManual,
    });
  }
  return nights.sort((a, b) => (a.day < b.day ? 1 : -1));
}

const CHRONO = {
  early: { label: "Early bird", emoji: "🐦", blurb: "Your body clock runs early. Guard your mornings for the hardest work." },
  middle: { label: "In between", emoji: "🕊️", blurb: "A middle body clock. Late morning is usually your sharpest time." },
  late: { label: "Night owl", emoji: "🦉", blurb: "Your body clock runs late. Fixed wake times and morning light pull it earlier." },
};

// Everything the Sleep card and the assistant need.
// `extraDays` lets days that only have a total (no times) still count toward sleep debt.
export function sleepReport(
  sessions: Session[],
  awakes: Awake[],
  opts: { needMin?: number; today?: string; extraDays?: { day: string; sleep_min: number | null }[] } = {},
): SleepReport {
  const need = opts.needMin && opts.needMin >= 300 && opts.needMin <= 660 ? opts.needMin : 480;
  const today = opts.today ?? londonDay(Date.now());
  const all = buildNights(sessions, awakes);
  const cutoff14 = shift(today, -13);
  const nights = all.filter((n) => n.day >= cutoff14 && n.day <= today).slice(0, 14);

  // Debt over the last 7 nights. Days with only a total (CSV import) fill gaps.
  const cutoff7 = shift(today, -6);
  const totals = new Map<string, number>();
  for (const d of opts.extraDays ?? []) if (d.sleep_min && d.day >= cutoff7 && d.day <= today) totals.set(d.day, d.sleep_min);
  for (const n of nights) if (n.day >= cutoff7) totals.set(n.day, n.asleepMin);
  const week = [...totals.values()];
  const debtMin = Math.max(0, Math.round(week.reduce((t, m) => t + (need - m), 0)));
  const avgAsleep = week.length ? Math.round(week.reduce((a, b) => a + b, 0) / week.length) : null;

  const bedC = circular(nights.map((n) => clockMin(n.bed)));
  const wakeC = circular(nights.map((n) => clockMin(n.wake)));
  const mid = (n: Night) => clockMin(new Date((Date.parse(n.bed) + Date.parse(n.wake)) / 2).toISOString());
  const midC = circular(nights.map(mid));

  // Body clock (Munich ChronoType method): mid-sleep on free days (Fri and Sat nights),
  // corrected for catch-up sleep.
  const dow = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();
  const free = nights.filter((n) => [0, 6].includes(dow(n.day)));
  const work = nights.filter((n) => ![0, 6].includes(dow(n.day)));
  let chronotype: Chronotype | null = null;
  let jetlagMin: number | null = null;
  if (nights.length >= 4) {
    const freeMid = circular(free.map(mid));
    const workMid = circular(work.map(mid));
    let msf = (freeMid ?? midC)!.mean;
    if (freeMid && free.length && work.length) {
      const sdF = free.reduce((t, n) => t + n.asleepMin, 0) / free.length;
      const sdW = work.reduce((t, n) => t + n.asleepMin, 0) / work.length;
      if (sdF > sdW) msf -= (sdF - sdW) / 2;
      if (workMid) jetlagMin = Math.round(diffClock(freeMid.mean, workMid.mean));
    }
    // Clock minutes from 18:00 so a 3am mid-point compares correctly.
    const fromEve = (msf - 18 * 60 + 1440) % 1440;
    chronotype = fromEve < 8.5 * 60 ? CHRONO.early : fromEve < 10.5 * 60 ? CHRONO.middle : CHRONO.late;
  }

  // Wake-ups in the night: how often, and when.
  const staged = nights.filter((n) => n.wakeups !== null);
  const wakeupsAvg = staged.length ? Math.round((staged.reduce((t, n) => t + (n.wakeups ?? 0), 0) / staged.length) * 10) / 10 : null;
  const hours = new Map<number, number>();
  for (const n of staged)
    for (const s of n.segments.filter((x) => x.awake)) {
      const h = Math.floor(clockMin(s.start) / 60);
      hours.set(h, (hours.get(h) ?? 0) + 1);
    }
  const topHour = [...hours].sort((a, b) => b[1] - a[1])[0];

  // Tonight: keep the wake time fixed (NHS: don't sleep in) and pay debt back with an earlier bedtime.
  let bedTonight: number | null = null;
  if (wakeC) {
    const ideal = wakeC.mean - need - 15;
    const payback = debtMin > 60 ? Math.min(45, Math.round(debtMin / 4 / 15) * 15) : 0;
    bedTonight = (((ideal - payback) % 1440) + 1440) % 1440;
    bedTonight = Math.round(bedTonight / 5) * 5;
  }

  const lastNight = nights.find((n) => n.day === today) ?? null;
  const tips: string[] = ["sleep-hours"];
  if (bedC && bedC.spread > 60) tips.push("sleep-regular");
  if (wakeupsAvg !== null && wakeupsAvg >= 2) tips.push("sleep-20min");
  if (bedC && (bedC.mean - 18 * 60 + 1440) % 1440 > 6.5 * 60) tips.push("sleep-screens"); // usually in bed after 00:30
  tips.push("sleep-avoid");

  return {
    needMin: need,
    nights,
    lastNight,
    debtMin,
    debtNights: week.length,
    avgAsleepMin: avgAsleep,
    avgBed: bedC ? Math.round(bedC.mean) : null,
    avgWake: wakeC ? Math.round(wakeC.mean) : null,
    avgMid: midC ? Math.round(midC.mean) : null,
    spreadMin: bedC ? Math.round(bedC.spread) : null,
    chronotype,
    jetlagMin,
    wakeupsAvg,
    wakeHour: topHour && topHour[1] >= 2 ? topHour[0] : null,
    bedTonight,
    windDown: bedTonight === null ? null : (bedTonight - 60 + 1440) % 1440,
    verdict: verdictFor(debtMin, week.length, avgAsleep, need),
    tips: [...new Set(tips)].slice(0, 4),
  };
}

function shift(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function verdictFor(debt: number, nights: number, avg: number | null, need: number) {
  if (!nights) return "No sleep data yet. Tap “Going to sleep” tonight, or connect your watch.";
  if (debt <= 30) return avg !== null && avg >= need ? "Fully rested. Keep the same hours." : "Nearly no sleep debt. Nice.";
  if (debt <= 180) return `A little behind: ${fmtDur(debt)} short this week. An earlier night or two clears it.`;
  if (debt <= 420) return `Running on ${fmtDur(debt)} of sleep debt. Expect lower focus and stronger cravings.`;
  return `Heavy sleep debt: ${fmtDur(debt)} this week. Make sleep tonight's non-negotiable.`;
}

// One paragraph for the assistant's context.
export function sleepSummary(r: SleepReport): string {
  if (!r.debtNights) return "No sleep data yet.";
  const bits = [
    `Sleep need ${fmtDur(r.needMin)}. Last 7 nights: average ${fmtDur(r.avgAsleepMin)} asleep, sleep debt ${fmtDur(r.debtMin)} (${r.debtNights} nights of data).`,
  ];
  if (r.lastNight)
    bits.push(
      `Last night: bed ${fmtClock(clockMin(r.lastNight.bed))}, up ${fmtClock(clockMin(r.lastNight.wake))}, slept ${fmtDur(r.lastNight.asleepMin)}${r.lastNight.wakeups !== null ? `, woke ${r.lastNight.wakeups} times (${fmtDur(r.lastNight.awakeMin)} awake)` : ""}.`,
    );
  if (r.avgBed !== null) bits.push(`Usual bedtime ${fmtClock(r.avgBed)} (varies ±${fmtDur(r.spreadMin)}), usual wake ${fmtClock(r.avgWake)}.`);
  if (r.chronotype) bits.push(`Body clock: ${r.chronotype.label}${r.jetlagMin !== null && r.jetlagMin > 60 ? `, weekend shift ${fmtDur(r.jetlagMin)} (social jetlag)` : ""}.`);
  if (r.wakeupsAvg !== null) bits.push(`Wakes ${r.wakeupsAvg} times a night on average${r.wakeHour !== null ? `, most often around ${r.wakeHour}:00` : ""}.`);
  if (r.bedTonight !== null) bits.push(`Suggested bedtime tonight ${fmtClock(r.bedTonight)}, screens off ${fmtClock(r.windDown)}.`);
  return bits.join(" ");
}
