import { aiConfigured } from "@/lib/ai";
import { bankRows } from "@/lib/bankRows";
import { makeBrief, slotNow } from "@/lib/coach";
import { fetchBankData } from "@/lib/lunchflow";
import { fromSyncToken, setStatus } from "@/lib/serviceDb";

export const maxDuration = 60;

const HOUR = 3600 * 1000;

// Heartbeat, called every 30 minutes by Supabase (see supabase/006_live.sql), so the dashboard
// keeps itself up to date while your phone and laptop are off.
export async function POST(req: Request) {
  const auth = await fromSyncToken(req);
  if ("error" in auth) return auth.error;
  const { db, userId } = auth;
  const done: Record<string, string> = {};

  const { data: status } = await db.from("sync_status").select("source, last_ok").eq("user_id", userId);
  const lastOk = (source: string) => Date.parse(status?.find((s) => s.source === source)?.last_ok ?? "") || 0;

  // Bank: every 2 hours (Lunch Flow refreshes from the banks a few times a day anyway).
  if (process.env.LUNCHFLOW_API_KEY && Date.now() - lastOk("bank") > 2 * HOUR - 5 * 60 * 1000) {
    try {
      const { count } = await db.from("transactions").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("source", "bank");
      const from = new Date(Date.now() - (count ? 7 : 90) * 24 * HOUR).toISOString().slice(0, 10);
      const accounts = await fetchBankData(from);
      const rows = bankRows(accounts).map((r) => ({ ...r, user_id: userId }));
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await db.from("transactions").upsert(rows.slice(i, i + 200), { onConflict: "user_id,external_id", ignoreDuplicates: true });
        if (error) throw new Error(error.message);
      }
      const info = { accounts: accounts.map(({ bank, name, balance, status }) => ({ bank, name, balance, status })) };
      await setStatus(db, userId, "bank", { ok: true, info });
      done.bank = `${rows.length} transactions checked`;
    } catch (e) {
      await setStatus(db, userId, "bank", { error: (e as Error).message });
      done.bank = `error: ${(e as Error).message}`;
    }
  }

  // Coach: a morning brief from 7am and an evening one from 6pm, once each.
  const { day, slot, hour } = slotNow();
  if (aiConfigured() && ((slot === "am" && hour >= 7) || (slot === "pm" && hour >= 18))) {
    const { data: existing } = await db.from("briefs").select("day").eq("user_id", userId).eq("day", day).eq("slot", slot).maybeSingle();
    if (!existing) {
      try {
        await makeBrief(db, userId);
        done.coach = `${slot} brief written`;
      } catch (e) {
        done.coach = `error: ${(e as Error).message}`;
      }
    }
  }

  // Housekeeping: keep 30 days of email and past events.
  const monthAgo = new Date(Date.now() - 30 * 24 * HOUR).toISOString();
  await db.from("inbox").delete().eq("user_id", userId).lt("received_at", monthAgo);
  await db.from("events").delete().eq("user_id", userId).lt("starts_at", monthAgo);

  await setStatus(db, userId, "heartbeat", { ok: true, info: done });
  return Response.json({ ok: true, ...done });
}

export const GET = POST;
