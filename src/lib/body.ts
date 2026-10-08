// Physique and mind: weigh-ins and body composition (Samsung export, the watch through Health Connect, or typed in),
// the training log, the AI's view of both, and a gentle flag when mood stays low.
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseSamsungCsv } from "./samsung";
import { guidanceByKey } from "./nhs";

export type BodyRow = {
  measured_at: string;
  source: "manual" | "samsung" | "watch";
  weight_kg: number | null;
  body_fat_pct: number | null;
  muscle_kg: number | null;
  lean_kg: number | null;
};
export type Training = { id?: string; day: string; what: string; minutes: number | null; note: string | null; source?: string; started_at?: string | null; created_at?: string };

const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);
const one = (v: number) => Math.round(v * 10) / 10;
// Only believable readings get stored, so a typo or a unit mix-up never skews the trend.
const kg = (v: unknown) => (isFinite(num(v)) && num(v) >= 20 && num(v) <= 350 ? one(num(v)) : null);
const dayOf = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
const pct = (v: unknown) => (isFinite(num(v)) && num(v) > 1 && num(v) < 75 ? one(num(v)) : null);

// Samsung Health export: body composition from the watch (and any weigh-in) lands in com.samsung.health.weight.*.csv.
export function bodyFromSamsung(files: { name: string; text: string }[]): BodyRow[] {
  const out = new Map<string, BodyRow>();
  for (const f of files) {
    if (!/(^|\.)(weight|body_composition)\.\d/.test(f.name)) continue;
    const t = parseSamsungCsv(f.text);
    const col = (name: string) => {
      const i = t.headers.findIndex((h) => h === name || h.endsWith("." + name));
      return (row: string[]) => (i >= 0 ? row[i] ?? "" : "");
    };
    const [start, weight, fat, muscle, lean] = ["start_time", "weight", "body_fat", "skeletal_muscle_mass", "fat_free_mass"].map(col);
    for (const r of t.rows) {
      const at = Date.parse(start(r).replace(" ", "T") + "Z");
      if (!isFinite(at)) continue;
      const row: BodyRow = { measured_at: new Date(at).toISOString(), source: "samsung", weight_kg: kg(weight(r)), body_fat_pct: pct(fat(r)), muscle_kg: kg(muscle(r)), lean_kg: kg(lean(r)) };
      if (row.weight_kg ?? row.body_fat_pct ?? row.muscle_kg ?? row.lean_kg) out.set(row.measured_at, row);
    }
  }
  return [...out.values()].sort((a, b) => a.measured_at.localeCompare(b.measured_at));
}

// HC Webhook payload: weight, body_fat and lean_body_mass arrive as separate records, often with the same time.
export function bodyFromPayload(p: Record<string, unknown>): Partial<BodyRow>[][] {
  const list = (k: string) => (Array.isArray(p[k]) ? (p[k] as Record<string, unknown>[]) : []);
  const at = (t: unknown) => (typeof t === "string" && isFinite(Date.parse(t)) ? new Date(t).toISOString() : null);
  const group = (k: string, field: keyof BodyRow, read: (r: Record<string, unknown>) => number | null) =>
    list(k)
      .map((r) => ({ measured_at: at(r.time), source: "watch" as const, [field]: read(r) }))
      .filter((r) => r.measured_at && r[field] !== null) as Partial<BodyRow>[];
  // One group per type, so each upsert only touches its own column and a weigh-in never wipes the body fat.
  return [group("weight", "weight_kg", (r) => kg(r.kilograms)), group("body_fat", "body_fat_pct", (r) => pct(r.percentage)), group("lean_body_mass", "lean_kg", (r) => kg(r.kilograms))].filter((g) => g.length);
}

export async function saveBodyFromPayload(db: SupabaseClient, userId: string, p: Record<string, unknown>) {
  let saved = 0;
  for (const g of bodyFromPayload(p)) {
    const { error } = await db.from("body_log").upsert(g.slice(0, 2000).map((r) => ({ ...r, user_id: userId })), { onConflict: "user_id,source,measured_at" });
    if (error) throw new Error(error.message);
    saved += g.length;
  }
  return saved;
}

// Health Connect exercise types (ExerciseSessionRecord), sent as numbers by HC Webhook.
const HC_EXERCISE: Record<string, string> = {
  0: "Workout", 2: "Badminton", 4: "Baseball", 5: "Basketball", 8: "Cycling", 9: "Indoor cycling", 10: "Boot camp", 11: "Boxing",
  13: "Calisthenics", 14: "Cricket", 16: "Dancing", 25: "Elliptical", 26: "Exercise class", 32: "Golf", 33: "Breathing",
  34: "Gymnastics", 36: "HIIT", 37: "Hiking", 44: "Martial arts", 48: "Pilates", 51: "Climbing", 53: "Rowing", 54: "Rowing machine",
  55: "Rugby", 56: "Run", 57: "Treadmill run", 64: "Football", 66: "Squash", 68: "Stair climbing", 69: "Stair machine",
  70: "Strength training", 71: "Stretching", 74: "Swimming", 73: "Open water swim", 75: "Table tennis", 76: "Tennis",
  78: "Volleyball", 79: "Walk", 81: "Weightlifting", 83: "Yoga",
};
// Samsung Health export exercise_type codes (the common ones).
const SAMSUNG_EXERCISE: Record<string, string> = { 0: "Workout", 1001: "Walk", 1002: "Run", 11007: "Cycling", 13001: "Hiking", 14001: "Swimming", 9002: "Yoga" };
const typeName = (raw: unknown, table: Record<string, string>) => {
  const v = String(raw ?? "").trim();
  if (/^\d+$/.test(v)) return table[v] ?? "Workout";
  // Older versions send names like "EXERCISE_TYPE_RUNNING".
  const name = v.replace(/^EXERCISE_TYPE_/i, "").replace(/_/g, " ").toLowerCase();
  return name ? name[0].toUpperCase() + name.slice(1) : "Workout";
};
const MIN_WORKOUT = 5; // minutes; shorter ones are usually auto-detected noise

// Watch workouts from HC Webhook, as training log rows.
export function workoutsFromPayload(p: Record<string, unknown>): Training[] {
  const list = Array.isArray(p.exercise) ? (p.exercise as Record<string, unknown>[]) : [];
  const out: Training[] = [];
  for (const r of list) {
    const start = typeof r.start_time === "string" && isFinite(Date.parse(r.start_time)) ? new Date(r.start_time).toISOString() : null;
    const mins = Math.round(num(r.duration_seconds) / 60);
    if (!start || !(mins >= MIN_WORKOUT)) continue;
    const title = typeof r.title === "string" && r.title.trim() ? r.title.trim().slice(0, 60) : null;
    out.push({ day: dayOf(start), what: title ?? typeName(r.type, HC_EXERCISE), minutes: Math.min(mins, 600), note: null, source: "watch", started_at: start });
  }
  return out;
}

// Samsung Health export: com.samsung.shealth.exercise.*.csv
export function workoutsFromSamsung(files: { name: string; text: string }[]): Training[] {
  const out = new Map<string, Training>();
  for (const f of files) {
    if (!/\.shealth\.exercise\.\d/.test(f.name)) continue;
    const t = parseSamsungCsv(f.text);
    const col = (name: string) => {
      const i = t.headers.findIndex((h) => h === name || h.endsWith("." + name));
      return (row: string[]) => (i >= 0 ? row[i] ?? "" : "");
    };
    const [start, duration, type, title] = ["start_time", "duration", "exercise_type", "custom_title"].map(col);
    for (const r of t.rows) {
      const at = Date.parse(start(r).replace(" ", "T") + "Z");
      const mins = Math.round(num(duration(r)) / 60000);
      if (!isFinite(at) || !(mins >= MIN_WORKOUT)) continue;
      const iso = new Date(at).toISOString();
      out.set(iso, { day: dayOf(iso), what: title(r).trim().slice(0, 60) || typeName(type(r), SAMSUNG_EXERCISE), minutes: Math.min(mins, 600), note: null, source: "samsung", started_at: iso });
    }
  }
  return [...out.values()];
}

export async function saveWorkoutsFromPayload(db: SupabaseClient, userId: string, p: Record<string, unknown>) {
  const rows = workoutsFromPayload(p).slice(0, 500);
  if (!rows.length) return 0;
  const { error } = await db.from("training_log").upsert(rows.map((r) => ({ ...r, user_id: userId })), { onConflict: "user_id,source,started_at" });
  if (error) throw new Error(error.message);
  return rows.length;
}

// The same reading can arrive from Samsung and from Health Connect; within 10 minutes they count once, filling each other's gaps.
export function mergeReadings(rows: BodyRow[]): BodyRow[] {
  const val = (v: unknown) => (v === null || v === undefined || !isFinite(num(v)) ? null : one(num(v)));
  const sorted = rows
    .map((r) => ({ ...r, weight_kg: val(r.weight_kg), body_fat_pct: val(r.body_fat_pct), muscle_kg: val(r.muscle_kg), lean_kg: val(r.lean_kg) }))
    .sort((a, b) => Date.parse(a.measured_at) - Date.parse(b.measured_at));
  const out: BodyRow[] = [];
  for (const r of sorted) {
    const last = out.at(-1);
    if (last && Date.parse(r.measured_at) - Date.parse(last.measured_at) < 10 * 60 * 1000) {
      out[out.length - 1] = {
        ...last,
        weight_kg: last.weight_kg ?? r.weight_kg,
        body_fat_pct: last.body_fat_pct ?? r.body_fat_pct,
        muscle_kg: last.muscle_kg ?? r.muscle_kg,
        lean_kg: last.lean_kg ?? r.lean_kg,
      };
    } else out.push(r);
  }
  return out;
}

type Metric = "weight_kg" | "body_fat_pct" | "muscle_kg" | "lean_kg";
// Latest value of one measure, and how it moved against the nearest reading about `days` ago.
export function trend(rows: BodyRow[], k: Metric, days: number) {
  const have = rows.filter((r) => r[k] !== null);
  const last = have.at(-1);
  if (!last) return null;
  const cutoff = Date.parse(last.measured_at) - days * 86400000;
  const before = [...have].reverse().find((r) => Date.parse(r.measured_at) <= cutoff);
  return { value: last[k]!, at: last.measured_at, change: before ? one(last[k]! - before[k]!) : null };
}

// A run of low moods: the latest check-ins, newest first, all at "Low" or below, with the newest one recent.
export function lowMoodRun(checkins: { day: string; mood: number | null }[], today: string) {
  const rated = checkins.filter((c) => c.mood !== null);
  let run = 0;
  while (run < rated.length && rated[run].mood! <= 4) run++;
  const fresh = rated[0] && Date.parse(today) - Date.parse(rated[0].day) <= 2 * 86400000;
  return fresh ? run : 0;
}
export const LOW_RUN = 4;

async function recentCheckins(db: SupabaseClient, userId?: string) {
  // Newest first; on the same day the night check-in comes before the morning one.
  let q = db.from("checkins").select("day, kind, mood").order("day", { ascending: false }).order("kind", { ascending: false }).limit(12);
  if (userId) q = q.eq("user_id", userId);
  const { data } = await q;
  return (data ?? []) as { day: string; kind: string; mood: number | null }[];
}

// For the AI: physique, training and mood. One block, added to the context the coach and planner read.
export async function bodyMindContext(db: SupabaseClient, userId?: string): Promise<string> {
  const from = (table: string, cols: string) => (userId ? db.from(table).select(cols).eq("user_id", userId) : db.from(table).select(cols));
  const since = new Date(Date.now() - 120 * 86400000).toISOString();
  const today = dayOf(new Date().toISOString());
  const [b, t, c] = await Promise.all([
    from("body_log", "measured_at, source, weight_kg, body_fat_pct, muscle_kg, lean_kg").gte("measured_at", since).order("measured_at"),
    from("training_log", "day, what, minutes, note, source").gte("day", dayOf(new Date(Date.now() - 14 * 86400000).toISOString())).order("day", { ascending: false }).limit(20),
    recentCheckins(db, userId),
  ]);
  const out = ["\n## Physique (weigh-ins and body composition)"];
  if (b.error) out.push("Not set up yet.");
  else {
    const rows = mergeReadings((b.data ?? []) as unknown as BodyRow[]);
    if (!rows.length) out.push("Nothing logged. Suggest a weekly weigh-in on the watch (Body composition) or on the Body page.");
    const line = (label: string, k: Metric, unit: string) => {
      const now = trend(rows, k, 30);
      if (!now) return;
      const long = trend(rows, k, 90);
      const sign = (v: number) => `${v > 0 ? "+" : ""}${v}${unit}`;
      out.push(`${label}: ${now.value}${unit} on ${dayOf(now.at)}${now.change !== null ? `, ${sign(now.change)} in 30 days` : ""}${long?.change != null ? `, ${sign(long.change)} in 90 days` : ""}`);
    };
    line("Weight", "weight_kg", "kg");
    line("Body fat", "body_fat_pct", "%");
    line("Skeletal muscle", "muscle_kg", "kg");
    line("Lean mass", "lean_kg", "kg");
  }
  out.push("\n## Training, last 14 days (typed in, or [watch] for workouts the watch recorded)");
  const sessions = (t.data ?? []) as unknown as Training[];
  if (t.error || !sessions.length) out.push("None logged.");
  for (const s of sessions) out.push(`- ${s.day}${s.source && s.source !== "manual" ? " [watch]" : ""}: ${String(s.what).slice(0, 60)}${s.minutes ? `, ${s.minutes} min` : ""}${s.note ? ` (${String(s.note).replace(/\s+/g, " ").slice(0, 100)})` : ""}`);
  const run = lowMoodRun(c, today);
  if (run >= LOW_RUN) {
    out.push(
      "\n## Mood needs care",
      `Their last ${run} check-ins were low (mood 4/10 or under). On mood, be warm and gentle, not demanding: suggest one small, doable step, ` +
        "getting outside, and talking to someone they trust. Cite [nhs:low-mood]. If they sound unsafe or hopeless, point to [nhs:samaritans].",
    );
  }
  return out.join("\n");
}

const LOW_TITLE = "Your mood has been low lately";

// Heartbeat: a gentle insight when mood stays low for several check-ins. At most one a fortnight, never a push.
export async function lowMoodCheck(db: SupabaseClient, userId: string, today: string) {
  const run = lowMoodRun(await recentCheckins(db, userId), today);
  if (run < LOW_RUN) return false;
  const { data: last } = await db
    .from("insights")
    .select("id")
    .eq("user_id", userId)
    .eq("title", LOW_TITLE)
    .gte("created_at", new Date(Date.now() - 14 * 86400000).toISOString())
    .limit(1);
  if (last?.length) return false;
  const src = ["low-mood", "samaritans"].map(guidanceByKey).filter(Boolean).map((g) => ({ title: g!.source, url: g!.url }));
  const { error } = await db.from("insights").insert({
    user_id: userId,
    kind: "health",
    priority: 2,
    title: LOW_TITLE,
    body:
      `Your last ${run} check-ins were low. That's worth noticing, not judging. One small thing today helps: a walk outside, a proper meal, or a message to someone you trust. ` +
      "If it lasts more than about 2 weeks, talk to your GP. If things ever feel too much, Samaritans are free on 116 123, day or night.",
    sources: src,
  });
  if (error) throw new Error(error.message);
  return true;
}
