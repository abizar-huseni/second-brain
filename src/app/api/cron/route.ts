import { aiConfigured } from "@/lib/ai";
import { bankRows } from "@/lib/bankRows";
import { makeBrief, noContacts as scrub, slotNow } from "@/lib/coach";
import { makeFuel } from "@/lib/fuel";
import { fmtClock, fmtDur, sleepReport } from "@/lib/sleep";
import { suggestDeviceActions } from "@/lib/deviceSuggest";
import { situationChecks } from "@/lib/situationChecks";
import { lowMoodCheck } from "@/lib/body";
import { addDays, nextDue, weekStart } from "@/lib/ldates";
import { makePlan, type PlanKind } from "@/lib/plan";
import { MILESTONES } from "@/lib/quit";
import { fileThoughts } from "@/lib/remember";
import { fetchBankData } from "@/lib/lunchflow";
import { sendPush } from "@/lib/push";
import { fromCron, setStatus } from "@/lib/serviceDb";
import { think } from "@/lib/think";

export const maxDuration = 60;

const HOUR = 3600 * 1000;

// Heartbeat, called every 30 minutes by Supabase (see supabase/010_source_keys.sql), so the dashboard
// keeps itself up to date while your phone and laptop are off.
export async function POST(req: Request) {
  const now = Date.now();
  const auth = await fromCron(req);
  if ("error" in auth) return auth.error;
  const { db, userId } = auth;
  const done: Record<string, string> = {};

  const { data: status } = await db.from("sync_status").select("source, last_ok, info").eq("user_id", userId);
  const lastOk = (source: string) => Date.parse(status?.find((s) => s.source === source)?.last_ok ?? "") || 0;
  const lastDay = (source: string) => (lastOk(source) ? new Date(lastOk(source)).toLocaleDateString("en-CA", { timeZone: "Europe/London" }) : "");

  // Bank: every 2 hours (Lunch Flow refreshes from the banks a few times a day anyway).
  if (process.env.LUNCHFLOW_API_KEY && Date.now() - lastOk("bank") > 2 * HOUR - 5 * 60 * 1000) {
    try {
      const { count } = await db.from("transactions").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("source", "bank");
      // When every account last synced: one failing account doesn't move it, so its gap is fetched once it's back.
      const allOk = (status?.find((s) => s.source === "bank")?.info as { all_ok_at?: number } | null)?.all_ok_at ?? lastOk("bank");
      // A week of overlap catches late-posting transactions; after an outage, go back to the last good sync (90 days at most).
      const since = count ? Math.min(allOk - 3 * 24 * HOUR, Date.now() - 7 * 24 * HOUR) : 0;
      const from = new Date(Math.max(since, Date.now() - 90 * 24 * HOUR)).toISOString().slice(0, 10);
      const accounts = await fetchBankData(from);
      const rows = bankRows(accounts).map((r) => ({ ...r, user_id: userId }));
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await db.from("transactions").upsert(rows.slice(i, i + 200), { onConflict: "user_id,external_id", ignoreDuplicates: true });
        if (error) throw new Error(error.message);
      }
      const broken = accounts.filter((a) => a.error);
      const allFine = !broken.length && accounts.every((a) => a.status === "ACTIVE");
      const info = { accounts: accounts.map(({ bank, name, balance, status, error }) => ({ bank, name, balance, status, error })), all_ok_at: allFine ? Date.now() : allOk };
      await setStatus(db, userId, "bank", { ok: true, info });
      // The healthy accounts still sync; a broken one shows as an error until it's back.
      if (broken.length) await setStatus(db, userId, "bank", { error: `${broken.map((a) => `${a.bank} ${a.name}`).join(", ")}: ${broken[0].error}` });
      done.bank = `${rows.length} transactions checked`;
    } catch (e) {
      await setStatus(db, userId, "bank", { error: (e as Error).message });
      done.bank = `error: ${(e as Error).message}`;
    }
  }

  const { day, slot, hour } = slotNow();

  // Recurring bills roll forward once their date has passed.
  const { data: pastBills } = await db.from("bills").select("id, next_due, every").eq("user_id", userId).lt("next_due", day).neq("every", "once");
  for (const b of pastBills ?? []) {
    let due = b.next_due as string;
    while (due < day) due = nextDue(due, b.every as string);
    await db.from("bills").update({ next_due: due }).eq("id", b.id);
  }

  // Thoughts you asked to be reminded about, from 8am on the day.
  if (hour >= 8) {
    const { data: due } = await db.from("notes").select("id, body, title").eq("user_id", userId).eq("reminded", false).lte("remind_on", day);
    for (const n of due ?? []) {
      await sendPush(db, userId, { title: `💭 ${n.title || "You asked me to remind you"}`, body: String(n.body).slice(0, 160), url: "/notes" });
      await db.from("notes").update({ reminded: true }).eq("id", n.id);
    }
  }

  // Quit support: celebrate milestones as they pass, and warn before your usual craving hour.
  const { data: quits } = await db.from("quits").select("id, name, started_at").eq("user_id", userId).eq("active", true);
  // Each run checks (last run's now, this run's now], so a milestone passing mid-run is never missed.
  const checkedAt = (status?.find((s) => s.source === "heartbeat")?.info as { quit_checked_at?: number } | null)?.quit_checked_at;
  const lastBeat = checkedAt || lastOk("heartbeat") || now - 30 * 60 * 1000;
  for (const q of quits ?? []) {
    const hrsNow = (now - Date.parse(q.started_at)) / HOUR;
    const hrsThen = (lastBeat - Date.parse(q.started_at)) / HOUR;
    const passed = MILESTONES.filter((m) => m.hours > hrsThen && m.hours <= hrsNow && m.hours >= 8).pop();
    if (passed) await sendPush(db, userId, { title: `🚭 ${passed.title} ${q.name}-free`, body: passed.body, url: "/quit" });
  }
  if (quits?.length && lastDay("quit-warn") !== day) {
    const { data: recent } = await db.from("cravings").select("at").eq("user_id", userId).gte("at", new Date(Date.now() - 14 * 24 * HOUR).toISOString());
    const counts = new Map<number, number>();
    for (const c of recent ?? []) {
      const h = Number(new Date(c.at).toLocaleString("en-GB", { timeZone: "Europe/London", hour: "2-digit", hour12: false }));
      counts.set(h, (counts.get(h) ?? 0) + 1);
    }
    const [peak, n] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
    // Heads-up in the half hour before the usual craving hour.
    if (peak !== null && n >= 2 && hour === (peak + 23) % 24 && new Date().getMinutes() >= 30) {
      await sendPush(db, userId, { title: "🛡️ Craving o'clock is coming", body: `Your cravings usually hit around ${peak}:00. Gum in your pocket, water nearby, and tap "I'm craving" if it comes.`, url: "/quit" });
      await setStatus(db, userId, "quit-warn", { ok: true });
    }
  }

  // Bedtime: one nudge an hour before the suggested bedtime (screens off), using the body clock.
  // A "night" runs noon to noon, so a 00:15 wind-down still counts as tonight.
  const night = new Date(Date.now() - 12 * HOUR).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const nudgedNight = (status?.find((x) => x.source === "sleep-nudge")?.info as { night?: string } | null)?.night;
  const nowMin = hour * 60 + new Date().getMinutes();
  // windDown can be after midnight (e.g. 00:15), so compare on a clock that starts at noon.
  const fromNoon = (m: number) => (m - 720 + 1440) % 1440;
  let sleepR: ReturnType<typeof sleepReport> | null = null;
  if (hour >= 19 || hour < 5) {
    const [{ data: rows }, { data: prof }] = await Promise.all([
      db
        .from("health_samples")
        .select("type, start_time, end_time, value")
        .eq("user_id", userId)
        .in("type", ["sleep", "awake", "sleep_manual"])
        .gte("end_time", new Date(Date.now() - 21 * 24 * HOUR).toISOString())
        .order("end_time"),
      db.from("profile").select("sleep_need_min").eq("user_id", userId).maybeSingle(),
    ]);
    const list = (rows ?? []) as { type: string; start_time: string; end_time: string; value: number }[];
    sleepR = sleepReport(
      list.filter((x) => x.type !== "awake").map((x) => ({ start: x.start_time, end: x.end_time, asleep_s: Number(x.value), manual: x.type === "sleep_manual" })),
      list.filter((x) => x.type === "awake").map((x) => ({ start: x.start_time, end: x.end_time })),
      { today: day, needMin: (prof as { sleep_need_min?: number } | null)?.sleep_need_min },
    );
  }
  const r = sleepR;
  if (r && (hour >= 19 || hour < 3) && nudgedNight !== night) {
    if (r.windDown !== null && r.bedTonight !== null && fromNoon(nowMin) >= fromNoon(r.windDown)) {
      await sendPush(db, userId, {
        title: "🌙 Wind down now",
        body: `Screens off, bed by ${fmtClock(r.bedTonight)}.${r.debtMin > 60 ? ` You're carrying ${fmtDur(r.debtMin)} of sleep debt.` : ""} NHS: an hour without screens helps you fall asleep.`,
        url: "/health#sleep",
      });
      await setStatus(db, userId, "sleep-nudge", { ok: true, info: { night } });
    }
  }

  // Dissertation, work hours and Graduate visa: fixed daily checks with top-priority insights, and a push when due.
  try {
    const pushed = ((status?.find((x) => x.source === "situation")?.info as { pushed?: Record<string, string> } | null)?.pushed ?? {}) as Record<string, string>;
    const due = await situationChecks(db, userId, day, pushed);
    if (hour >= 8 && due.length) {
      for (const p of due) {
        await sendPush(db, userId, { title: p.title, body: p.body, url: p.url });
        pushed[p.key] = day;
      }
      await setStatus(db, userId, "situation", { ok: true, info: { pushed } });
    }
  } catch (e) {
    console.error("situation checks:", (e as Error).message);
  }

  // Laptop and phone: suggest safe fixes (screen timeout, space, bedtime sleep, dim at wind-down) to approve in the app.
  try {
    await suggestDeviceActions(db, userId, { nowMin, day, night, sleep: sleepR });
  } catch (e) {
    console.error("device suggestions:", (e as Error).message);
  }

  // A gentle note (never a push) when mood stays low for several check-ins.
  await lowMoodCheck(db, userId, day).catch((e) => console.error("low mood:", (e as Error).message));

  // Morning check-in nudge: 20 minutes after the watch says you woke up, or 9am if it hasn't synced a wake-up.
  if (hour >= 5 && hour < 12 && lastDay("morning-nudge") !== day) {
    const { data: morning } = await db.from("checkins").select("day").eq("user_id", userId).eq("day", day).eq("kind", "morning").maybeSingle();
    if (morning) await setStatus(db, userId, "morning-nudge", { ok: true });
    else {
      const { data: woke } = await db
        .from("health_samples")
        .select("end_time")
        .eq("user_id", userId)
        .in("type", ["sleep", "sleep_manual"])
        .gte("end_time", new Date(Date.now() - 10 * HOUR).toISOString())
        .order("end_time", { ascending: false })
        .limit(1);
      const wake = Date.parse(woke?.[0]?.end_time ?? "");
      // Only a wake-up from this morning counts (London time 4am or later).
      const wokeToday = Number.isFinite(wake) && new Date(wake).toLocaleDateString("en-CA", { timeZone: "Europe/London" }) === day && Number(new Date(wake).toLocaleString("en-GB", { timeZone: "Europe/London", hour: "numeric", hourCycle: "h23" })) >= 4;
      if (wokeToday ? Date.now() - wake >= 20 * 60 * 1000 : hour >= 9) {
        await sendPush(db, userId, { title: "☀️ Morning check-in", body: "10 seconds: mood, energy and your top 3 for today. It shapes everything I plan for you.", url: "/checkin" });
        await setStatus(db, userId, "morning-nudge", { ok: true });
      }
    }
  }

  // 9:30pm nudge if the night check-in hasn't happened.
  if (hour >= 21 && lastDay("nudge") !== day) {
    const { data: night } = await db.from("checkins").select("day").eq("user_id", userId).eq("day", day).eq("kind", "night").maybeSingle();
    // Marked done only once it's sent or the check-in exists, so the 21:00 run leaves it for 21:30.
    if (night) await setStatus(db, userId, "nudge", { ok: true });
    else if (new Date().getMinutes() >= (hour === 21 ? 30 : 0)) {
      await sendPush(db, userId, { title: "🌙 2 minutes before bed", body: "Log your night check-in. Your coach is only as good as what you tell it.", url: "/checkin" });
      await setStatus(db, userId, "nudge", { ok: true });
    }
  }

  // Housekeeping: keep 30 days of email and past events.
  const monthAgo = new Date(Date.now() - 30 * 24 * HOUR).toISOString();
  await db.from("inbox").delete().eq("user_id", userId).lt("received_at", monthAgo);
  await db.from("events").delete().eq("user_id", userId).lt("starts_at", monthAgo);

  await setStatus(db, userId, "heartbeat", { ok: true, info: { ...done, quit_checked_at: now } });

  // One AI job per run so each fits in the time limit, last so a slow job never stops the work above. Runs the first job that is due:
  // 6am think ahead → 7am brief → today's plan → year → week → money → 6pm brief → 8pm tomorrow's plan.
  const tomorrow = addDays(day, 1);
  const week = weekStart(day);
  const { data: planRows } = await db.from("plans").select("kind, period, created_at").eq("user_id", userId).gte("created_at", new Date(Date.now() - 40 * 24 * HOUR).toISOString());
  const hasPlan = (kind: string, period: string) => (planRows ?? []).some((p) => p.kind === kind && p.period === period);
  const { data: briefRows } = await db.from("briefs").select("slot").eq("user_id", userId).eq("day", day);
  const hasBrief = (s: string) => (briefRows ?? []).some((b) => b.slot === s);
  const isSunday = new Date(`${day}T12:00:00Z`).getUTCDay() === 0;

  const plan = (kind: PlanKind, period: string, push?: (c: Record<string, unknown>) => { title: string; body: string; url?: string }) => async () => {
    const content = await makePlan(db, kind, period, userId);
    if (push) await sendPush(db, userId, push(content));
    return `${kind} plan for ${period}`;
  };
  // A job that failed waits 2 hours before retrying, so one bad answer never blocks the rest.
  const failed = ((status?.find((s) => s.source === "ai")?.info as { failed?: Record<string, number> } | null)?.failed ?? {}) as Record<string, number>;
  const { count: unfiled } = await db.from("notes").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("processed", false);
  const jobs: [string, boolean, () => Promise<string>][] = [
    ["file-thoughts", (unfiled ?? 0) > 0, async () => `${(await fileThoughts(db, { userId })).length} thoughts filed`],
    ["think", hour >= 6 && lastDay("think") !== day, async () => {
      const found = await think(db, userId);
      await setStatus(db, userId, "think", { ok: true, info: { insights: found.length } });
      const top = [...found].sort((a, b) => a.priority - b.priority)[0];
      if (top?.priority === 1) await sendPush(db, userId, { title: `💡 ${scrub(top.title) || "Something needs you today"}`, body: scrub(top.body).slice(0, 160) });
      return `${found.length} insights`;
    }],
    ["brief-am", slot === "am" && hour >= 7 && !hasBrief("am"), async () => {
      const brief = await makeBrief(db, userId);
      await sendPush(db, userId, { title: "☀️ Your morning brief", body: scrub(String(brief.headline)) });
      return "am brief";
    }],
    ["fuel", hour >= 6 && !hasPlan("fuel", day), async () => {
      const f = await makeFuel(db, day, userId);
      return `fuel: ${f.theme}`;
    }],
    ["day", hour >= 6 && hour < 20 && !hasPlan("day", day), plan("day", day)],
    ["year", hour >= 6 && !(planRows ?? []).some((p) => p.kind === "year"), plan("year", day.slice(0, 7))],
    ["week", hour >= 6 && !hasPlan("week", week), plan("week", week)],
    ["next-week", isSunday && hour >= 19 && !hasPlan("week", addDays(week, 7)), plan("week", addDays(week, 7))],
    ["money", hour >= 6 && !hasPlan("money", week), plan("money", week)],
    ["brief-pm", slot === "pm" && hour >= 18 && !hasBrief("pm"), async () => {
      const brief = await makeBrief(db, userId);
      await sendPush(db, userId, { title: "🌙 Evening check", body: scrub(String(brief.headline)) });
      return "pm brief";
    }],
    ["tomorrow", hour >= 20 && !hasPlan("day", tomorrow), plan("day", tomorrow, (c) => ({ title: "📋 Tomorrow is planned", body: scrub(String(c.headline ?? "")) || "Your non-negotiables are ready.", url: "/plan" }))],
  ];
  // Stop by 55s (maxDuration is 60); with under 15s left, wait for the next run.
  const deadline = now + 55 * 1000;
  const job = aiConfigured() && deadline - Date.now() > 15 * 1000 ? jobs.find(([key, due]) => due && Date.now() - (failed[key] ?? 0) > 2 * HOUR) : undefined;
  if (job) {
    const [key, , run] = job;
    // Counted as failed before it starts, so a run killed at the time limit still waits 2 hours.
    await setStatus(db, userId, "ai", { info: { failed: { ...failed, [key]: Date.now() } } });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const limit = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("timed out")), deadline - Date.now());
    });
    try {
      done.ai = await Promise.race([run(), limit]);
      await setStatus(db, userId, "ai", { ok: true, info: { failed: { ...failed, [key]: 0 } } });
    } catch (e) {
      done.ai = `${key} error: ${(e as Error).message}`;
      await setStatus(db, userId, "ai", { error: done.ai, info: { failed: { ...failed, [key]: Date.now() } } });
    } finally {
      clearTimeout(timer);
    }
  }
  return Response.json({ ok: true, ...done });
}

export const GET = POST;
