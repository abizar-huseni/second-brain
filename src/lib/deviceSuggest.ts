// Server-only: the brain suggests safe laptop and phone fixes from each device's status and your sleep.
// Nothing runs until you approve it in the app, and the agent checks it again before running.
import type { SupabaseClient } from "@supabase/supabase-js";
import { CATALOG, checkParams, type DeviceKind } from "./agentCatalog";
import { fmtClock, fmtDur, type SleepReport } from "./sleep";

// The only actions the brain may ever suggest. Never commands, file reads or trusting a browser:
// this list is checked in code before anything is saved, whatever the reason for the suggestion.
export const AI_ACTIONS = new Set(["screen_timeout", "clean_temp", "sleep_now", "brightness", "vault_sync"]);

type Info = { screen_off_min?: number; disk_free?: number; disk_total?: number; battery?: number; charging?: boolean };
type Device = { id: string; name: string; kind: string; last_seen: string | null; info: Info | null };
type Idea = { action: string; params: Record<string, unknown>; title: string; why: string; dedupe: string; expires_min?: number };
export type DeviceCtx = { nowMin: number; day: string; night: string; sleep: SleepReport | null };

const MIN = 60_000;
// Evening times can pass midnight (a 00:15 bedtime), so compare on a clock that starts at noon.
const fromNoon = (m: number) => (m - 720 + 1440) % 1440;
const seenWithin = (d: Device, mins: number) => !!d.last_seen && Date.now() - Date.parse(d.last_seen) < mins * MIN;

export function ideasFor(d: Device, { nowMin, day, night, sleep }: DeviceCtx): Idea[] {
  const s = d.info ?? {};
  const out: Idea[] = [];
  const now = fromNoon(nowMin);

  if (d.kind === "windows") {
    // The screen going black too fast. Same dedupe key as the agent's own idea, so it's never suggested twice.
    const off = Number(s.screen_off_min);
    if (off > 0 && off < 5)
      out.push({ action: "screen_timeout", params: { minutes: 15, when: "both" }, title: `Stop your screen going black after ${off} min`, why: `It turns off after ${off} minute${off === 1 ? "" : "s"} of no use. 15 minutes keeps it on while you read or think and still saves battery.`, dedupe: `screen_timeout:${off}` });

    if (s.disk_free !== undefined && s.disk_total && (s.disk_free < 8e9 || s.disk_free / s.disk_total < 0.08))
      out.push({ action: "clean_temp", params: {}, title: `Free up space: only ${(s.disk_free / 1e9).toFixed(1)} GB left`, why: "A nearly full drive slows everything down. Old temp files are safe to delete.", dedupe: `clean:${day}` });

    // Still on the laptop well past tonight's bedtime.
    const bed = sleep?.bedTonight;
    if (bed != null && seenWithin(d, 10) && now >= fromNoon(bed) + 30 && now < fromNoon(5 * 60)) {
      const debt = sleep && sleep.debtMin > 30 ? ` You're ${fmtDur(sleep.debtMin)} short on sleep this week.` : "";
      out.push({ action: "sleep_now", params: {}, title: `It's ${fmtClock(nowMin)}, past your ${fmtClock(bed)} bedtime. Sleep the laptop?`, why: `Your work stays open for the morning.${debt}`, dedupe: `bedtime:${night}`, expires_min: 60 });
    }
  }

  // Phone in hand during wind-down: dim it.
  if (d.kind === "android" && sleep?.windDown != null && sleep.bedTonight != null && seenWithin(d, 15)) {
    if (now >= fromNoon(sleep.windDown) && now < fromNoon(sleep.bedTonight) + 60)
      out.push({ action: "brightness", params: { level: 20 }, title: "Wind down: dim your phone", why: `Bed by ${fmtClock(sleep.bedTonight)}. A bright screen late keeps you awake; the NHS suggests an hour without screens before bed.`, dedupe: `winddown:${night}`, expires_min: 90 });
  }
  return out;
}

// Saves new suggestions for every active device. Returns how many were added.
export async function suggestDeviceActions(db: SupabaseClient, userId: string, ctx: DeviceCtx): Promise<number> {
  const { data: devices, error } = await db.from("devices").select("id, name, kind, last_seen, info").eq("user_id", userId).eq("revoked", false);
  if (error || !devices?.length) return 0;
  let added = 0;
  for (const d of devices as Device[]) {
    for (const idea of ideasFor(d, ctx)) {
      const item = CATALOG[idea.action];
      // Enforced here, not just by the rules above: allow-listed, possible on this device, params in range.
      if (!AI_ACTIONS.has(idea.action) || !item || !item.on.includes(d.kind as DeviceKind)) continue;
      const checked = checkParams(idea.action, idea.params);
      if (!checked.ok) continue;
      // Skip it if it was suggested before, or the same action is already waiting for a yes on this device.
      const [{ data: seen }, { data: pending }] = await Promise.all([
        db.from("device_actions").select("id").eq("device_id", d.id).eq("dedupe", idea.dedupe).limit(1),
        db.from("device_actions").select("id").eq("device_id", d.id).eq("action", idea.action).eq("status", "proposed").limit(1),
      ]);
      if (seen?.length || pending?.length) continue;
      const { error: e } = await db.from("device_actions").insert({
        user_id: userId,
        device_id: d.id,
        source: "ai",
        action: idea.action,
        params: checked.params,
        title: idea.title.slice(0, 200),
        why: idea.why.slice(0, 500),
        dedupe: idea.dedupe,
        expires_at: idea.expires_min ? new Date(Date.now() + idea.expires_min * MIN).toISOString() : null,
      });
      if (!e) added++;
    }
  }
  return added;
}
