import { fromSyncToken, setStatus } from "@/lib/serviceDb";

type Email = { id: string; thread_id?: string; from: string; subject: string; snippet?: string; received_at: string; unread?: boolean; starred?: boolean };
type Event = { id: string; title: string; starts_at: string; ends_at?: string; all_day?: boolean; location?: string };

// Rough sorting so the coach can spot bills and uni mail without reading everything.
const RULES: [string, RegExp][] = [
  ["money", /invoice|payment|bill\b|statement|direct debit|payslip|salary|refund|overdue|reminder to pay|klarna|clearpay|council tax|hmrc|bank/i],
  ["uni", /universit|\.ac\.uk|dissertation|module|assessment|coursework|graduation|visa|ukvi|\bcas\b|brp|evisa/i],
];
const categorize = (text: string) => RULES.find(([, re]) => re.test(text))?.[0] ?? "other";

// "Jane Doe <jane@x.com>" → name + email
function parseFrom(from: string) {
  const m = from.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>/);
  return m ? { from_name: m[1].trim() || m[2], from_email: m[2].trim() } : { from_name: from.trim(), from_email: from.trim() };
}

// Receives new Gmail + upcoming Calendar events from the Google Apps Script in integrations/.
export async function POST(req: Request) {
  const auth = await fromSyncToken(req, "google");
  if ("error" in auth) return auth.error;
  const { db, userId } = auth;
  const body = (await req.json().catch(() => null)) as { emails?: Email[]; events?: Event[] } | null;
  if (!body) return Response.json({ error: "Body must be JSON" }, { status: 400 });

  const emails = (body.emails ?? []).slice(0, 200).map((e) => {
    const sender = parseFrom(e.from ?? "");
    return {
      user_id: userId,
      external_id: e.id,
      thread_id: e.thread_id ?? null,
      ...sender,
      subject: (e.subject ?? "").slice(0, 300),
      snippet: (e.snippet ?? "").slice(0, 300),
      received_at: e.received_at,
      unread: e.unread ?? true,
      starred: e.starred ?? false,
      category: categorize(`${e.from} ${e.subject} ${e.snippet ?? ""}`),
    };
  });
  if (emails.length) {
    const { error } = await db.from("inbox").upsert(emails, { onConflict: "user_id,external_id" });
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  if (body.events) {
    const events = body.events.slice(0, 300).map((e) => ({
      user_id: userId,
      external_id: e.id,
      title: (e.title ?? "").slice(0, 200),
      starts_at: e.starts_at,
      ends_at: e.ends_at ?? null,
      all_day: e.all_day ?? false,
      location: e.location?.slice(0, 200) || null,
    }));
    // The script sends every event overlapping the next 7 days (including all-day and in-progress ones),
    // so anything else stored in that window was cancelled.
    const now = new Date().toISOString();
    const { data: stored } = await db
      .from("events")
      .select("external_id")
      .eq("user_id", userId)
      .or(`ends_at.gt.${now},and(ends_at.is.null,starts_at.gte.${now})`);
    const keep = new Set(events.map((e) => e.external_id));
    const gone = (stored ?? []).map((s) => s.external_id as string).filter((id) => !keep.has(id));
    if (gone.length) await db.from("events").delete().eq("user_id", userId).in("external_id", gone);
    if (events.length) {
      const { error } = await db.from("events").upsert(events, { onConflict: "user_id,external_id" });
      if (error) return Response.json({ error: error.message }, { status: 500 });
    }
  }

  await setStatus(db, userId, "google", { ok: true, info: { emails: emails.length, events: body.events?.length ?? 0 } });
  return Response.json({ ok: true, emails: emails.length, events: body.events?.length ?? 0 });
}
