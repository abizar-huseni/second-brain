// Turns Lunch Flow accounts into rows for the transactions table (used by the Sync button and the heartbeat).
import { categorize } from "./categorize";

type Account = { id: number; name: string; bank: string; transactions: { id: string; day: string; amount: number; description: string }[] };

export function bankRows(accounts: Account[]) {
  return accounts.flatMap((a) =>
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
}
