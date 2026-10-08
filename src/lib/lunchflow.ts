// Server-only: talks to Lunch Flow, which connects UK banks (Lloyds, HSBC, ...) through open banking.
// Needs one Vercel env var: LUNCHFLOW_API_KEY (Lunch Flow → Destinations → REST API).
const API = "https://www.lunchflow.app/api/v1";

export async function lf<T>(path: string): Promise<T> {
  const key = process.env.LUNCHFLOW_API_KEY;
  if (!key) throw new Error("Bank sync isn't set up yet: add LUNCHFLOW_API_KEY in Vercel, then redeploy.");
  const res = await fetch(API + path, { headers: { "x-api-key": key }, cache: "no-store" });
  const text = await res.text();
  if (!res.ok) throw new Error(`Lunch Flow ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text) as T;
}

type Account = { id: number; name: string; institution_name: string; institution_logo?: string; currency: string; status: string };
type Tx = { id: string; amount: number; currency: string; date: string; merchant?: string; description?: string; isPending?: boolean };

export type BankData = {
  id: number;
  name: string;
  bank: string;
  logo: string | null;
  status: string;
  balance: number | null;
  transactions: { id: string; day: string; amount: number; description: string }[];
  error?: string; // this account's transactions couldn't be fetched this time
};

// Every connected account with its balance and booked transactions since `from` (YYYY-MM-DD).
// One failing account comes back with `error` instead of stopping the others; it only throws if every account fails.
export async function fetchBankData(from: string): Promise<BankData[]> {
  const { accounts } = await lf<{ accounts: Account[] }>("/accounts");
  const data = await Promise.all(
    accounts.map(async (a) => {
      const [bal, tx] = await Promise.all([
        lf<{ balance: { amount: number } }>(`/accounts/${a.id}/balance`).catch(() => null),
        lf<{ transactions: Tx[] }>(`/accounts/${a.id}/transactions?from=${from}`).then(
          (r) => ({ transactions: r.transactions ?? [], error: undefined as string | undefined }),
          (e) => ({ transactions: [] as Tx[], error: (e as Error).message }),
        ),
      ]);
      return {
        id: a.id,
        name: a.name,
        bank: a.institution_name,
        logo: a.institution_logo ?? null,
        status: a.status,
        balance: bal?.balance?.amount ?? null,
        error: tx.error,
        transactions: tx.transactions
          .filter((t) => !t.isPending)
          .map((t) => ({
            id: t.id,
            day: t.date,
            amount: Number(t.amount), // negative = money out
            description: [t.merchant, t.description].filter(Boolean).join(" · ") || "Bank transaction",
          })),
      };
    }),
  );
  if (data.length && data.every((a) => a.error)) throw new Error(data[0].error);
  return data;
}
