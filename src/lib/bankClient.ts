"use client";
// Browser side of bank sync: calls our API routes with your login, saves results with your login.
import { supabase } from "./supabase";
import { categorize } from "./categorize";
import { daysAgo } from "./dates";

export type BankAccount = { uid: string; name: string; currency: string; last4: string; balance?: number | null };
export type BankConnection = { id: string; bank: string; session_id: string; accounts: BankAccount[]; valid_until: string | null; last_synced: string | null };

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Request failed");
  return json as T;
}

type SyncResult = { balance: { amount: string } | null; transactions: { id: string; day: string; income: boolean; amount: number; description: string }[] };

export async function syncConnection(c: BankConnection): Promise<number> {
  // First sync grabs 90 days; after that, a week of overlap catches late-posting transactions.
  const from = c.last_synced ? daysAgo(7) : daysAgo(90);
  let added = 0;
  const accounts: BankAccount[] = [];
  for (const a of c.accounts) {
    const r = await api<SyncResult>("/api/bank/sync", { uid: a.uid, date_from: from });
    accounts.push({ ...a, balance: r.balance ? Number(r.balance.amount) : null });
    const label = `${c.bank} ${a.name}${a.last4 ? " ••" + a.last4 : ""}`;
    const rows = r.transactions
      .filter((t) => t.day && t.amount)
      .map((t) => ({
        day: t.day,
        kind: t.income ? "income" : "expense",
        amount: t.amount,
        category: categorize(t.description, t.income),
        description: t.description,
        account: label,
        source: "bank",
        external_id: `eb|${a.uid}|${t.id}`,
      }));
    const before = await supabase.from("transactions").select("id", { count: "exact", head: true });
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabase.from("transactions").upsert(rows.slice(i, i + 200), { onConflict: "user_id,external_id", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    }
    const after = await supabase.from("transactions").select("id", { count: "exact", head: true });
    added += (after.count ?? 0) - (before.count ?? 0);
  }
  await supabase.from("bank_connections").update({ accounts, last_synced: new Date().toISOString() }).eq("id", c.id);
  return added;
}
