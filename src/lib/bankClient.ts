"use client";
// Browser side of bank sync: asks our server route for bank data, saves it under your login.
import { supabase } from "./supabase";
import { categorize } from "./categorize";
import { daysAgo } from "./dates";

export type BankAccount = { id: number; name: string; bank: string; logo: string | null; status: string; balance: number | null };

type SyncResponse = {
  accounts: (BankAccount & { transactions: { id: string; day: string; amount: number; description: string }[] })[];
  error?: string;
};

const LAST_SYNC = "bank_last_sync";

export async function syncBanks(): Promise<{ accounts: BankAccount[]; added: number }> {
  const { data } = await supabase.auth.getSession();
  let last: string | null = null;
  try {
    last = localStorage.getItem(LAST_SYNC);
  } catch {}
  // First sync grabs 90 days; after that, a week of overlap catches late-posting transactions.
  const from = last ? daysAgo(7) : daysAgo(90);

  const res = await fetch("/api/bank/sync", {
    method: "POST",
    headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from }),
  });
  const json = (await res.json()) as SyncResponse;
  if (!res.ok) throw new Error(json.error ?? "Sync failed");

  const rows = json.accounts.flatMap((a) =>
    a.transactions
      .filter((t) => t.day && t.amount)
      .map((t) => ({
        day: t.day,
        kind: t.amount > 0 ? "income" : "expense",
        amount: Math.abs(t.amount),
        category: categorize(t.description, t.amount > 0),
        description: t.description,
        account: `${a.bank} ${a.name}`,
        source: "bank",
        external_id: `lf|${a.id}|${t.id}`,
      })),
  );

  const before = await supabase.from("transactions").select("id", { count: "exact", head: true });
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from("transactions").upsert(rows.slice(i, i + 200), { onConflict: "user_id,external_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  const after = await supabase.from("transactions").select("id", { count: "exact", head: true });

  const accounts: BankAccount[] = json.accounts.map((a) => ({ id: a.id, name: a.name, bank: a.bank, logo: a.logo, status: a.status, balance: a.balance }));
  try {
    localStorage.setItem(LAST_SYNC, new Date().toISOString());
    localStorage.setItem("bank_accounts", JSON.stringify(accounts));
  } catch {}
  return { accounts, added: (after.count ?? 0) - (before.count ?? 0) };
}

export function cachedAccounts(): BankAccount[] {
  try {
    return JSON.parse(localStorage.getItem("bank_accounts") ?? "[]");
  } catch {
    return [];
  }
}

export function lastSynced(): string | null {
  try {
    return localStorage.getItem(LAST_SYNC);
  } catch {
    return null;
  }
}
