import { lf, requireUser } from "@/lib/lunchflow";

type Account = { id: number; name: string; institution_name: string; institution_logo?: string; currency: string; status: string };
type Tx = { id: string; amount: number; currency: string; date: string; merchant?: string; description?: string; isPending?: boolean };

// Returns every connected account with its balance and transactions since `from`.
export async function POST(req: Request) {
  try {
    if (!(await requireUser(req))) return Response.json({ error: "Not signed in" }, { status: 401 });
    const { from } = (await req.json()) as { from: string };
    const { accounts } = await lf<{ accounts: Account[] }>("/accounts");

    const result = await Promise.all(
      accounts.map(async (a) => {
        const [bal, tx] = await Promise.all([
          lf<{ balance: { amount: number } }>(`/accounts/${a.id}/balance`).catch(() => null),
          lf<{ transactions: Tx[] }>(`/accounts/${a.id}/transactions?from=${from}`),
        ]);
        return {
          id: a.id,
          name: a.name,
          bank: a.institution_name,
          logo: a.institution_logo ?? null,
          status: a.status,
          balance: bal?.balance.amount ?? null,
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
    return Response.json({ accounts: result });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
