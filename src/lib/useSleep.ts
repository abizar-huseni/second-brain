"use client";
// Loads sleep sessions and works out the report. Also handles the manual "Going to sleep" / "I'm up" taps.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { lday } from "./ldates";
import { sleepReport, type SleepReport, type Session, type Awake } from "./sleep";

const LOCAL_BED = "sb-bed-at"; // fallback if the database is not upgraded yet

export function useSleep() {
  const [report, setReport] = useState<SleepReport | null>(null);
  const [bedAt, setBedAt] = useState<string | null>(null);
  const [needMin, setNeedMin] = useState(480);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 21 * 86400000).toISOString();
    const [samples, prof, days] = await Promise.all([
      supabase.from("health_samples").select("type,start_time,end_time,value").in("type", ["sleep", "awake", "sleep_manual"]).gte("end_time", since).order("end_time"),
      supabase.from("profile").select("sleep_need_min, bed_at").maybeSingle(),
      supabase.from("health_days").select("day, sleep_min").gte("day", lday(-8)),
    ]);
    const rows = (samples.data ?? []) as { type: string; start_time: string; end_time: string; value: number }[];
    const sessions: Session[] = rows
      .filter((r) => r.type !== "awake")
      .map((r) => ({ start: r.start_time, end: r.end_time, asleep_s: Number(r.value), manual: r.type === "sleep_manual" }));
    const awakes: Awake[] = rows.filter((r) => r.type === "awake").map((r) => ({ start: r.start_time, end: r.end_time }));
    const need = (prof.data as { sleep_need_min?: number } | null)?.sleep_need_min ?? 480;
    let bed = (prof.data as { bed_at?: string | null } | null)?.bed_at ?? null;
    if (prof.error) {
      try {
        bed = localStorage.getItem(LOCAL_BED);
      } catch {}
    }
    setNeedMin(need);
    setBedAt(bed);
    setReport(sleepReport(sessions, awakes, { needMin: need, today: lday(), extraDays: (days.data ?? []) as { day: string; sleep_min: number | null }[] }));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function goingToSleep() {
    setError("");
    const now = new Date().toISOString();
    setBedAt(now);
    const { error: e } = await supabase.from("profile").upsert({ bed_at: now }, { onConflict: "user_id" });
    if (e) {
      try {
        localStorage.setItem(LOCAL_BED, now);
      } catch {}
    }
  }

  async function cancelSleep() {
    setBedAt(null);
    await supabase.from("profile").upsert({ bed_at: null }, { onConflict: "user_id" });
    try {
      localStorage.removeItem(LOCAL_BED);
    } catch {}
  }

  // Saves a night from two times. Used by "I'm up" and by "Fix a night".
  async function saveNight(bed: string, wake: string) {
    setError("");
    const secs = Math.round((Date.parse(wake) - Date.parse(bed)) / 1000);
    if (!(secs > 30 * 60) || secs > 16 * 3600) {
      setError("That doesn't look like a night's sleep. Check the times.");
      return false;
    }
    // Most people take about 15 minutes to fall asleep.
    const asleep = Math.max(0, secs - 15 * 60);
    const { error: e } = await supabase.from("health_samples").upsert(
      { type: "sleep_manual", start_time: bed, end_time: wake, value: asleep },
      { onConflict: "user_id,type,start_time,end_time" },
    );
    if (e) {
      setError(e.message.includes("policy") ? "Your database needs the sleep update (supabase/008_sleep.sql). It applies itself on the next deploy, or paste it in Supabase once." : e.message);
      return false;
    }
    // Keep the daily total in step if the watch has nothing for that morning.
    const day = new Date(wake).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
    const { data: existing } = await supabase.from("health_days").select("sleep_min").eq("day", day).maybeSingle();
    if (!existing?.sleep_min) await supabase.from("health_days").upsert({ day, sleep_min: Math.round(asleep / 60), updated_at: new Date().toISOString() }, { onConflict: "user_id,day" });
    await load();
    return true;
  }

  async function imUp() {
    if (!bedAt) return;
    const ok = await saveNight(bedAt, new Date().toISOString());
    if (ok) await cancelSleep();
  }

  async function setNeed(min: number) {
    setNeedMin(min);
    await supabase.from("profile").upsert({ sleep_need_min: min }, { onConflict: "user_id" });
    await load();
  }

  return { report, bedAt, needMin, error, goingToSleep, cancelSleep, imUp, saveNight, setNeed, reload: load };
}
