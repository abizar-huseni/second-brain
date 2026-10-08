import { eb, handle } from "@/lib/enablebanking";

type Amount = { amount: string; currency: string };
type Tx = {
  entry_reference?: string;
  transaction_id?: string;
  transaction_amount: Amount;
  credit_debit_indicator: "CRDT" | "DBIT";
  status?: string;
  booking_date?: string;
  value_date?: string;
  transaction_date?: string;
  creditor?: { name?: string };
  debtor?: { name?: string };
  remittance_information?: string[];
};

// Pulls balances and transactions for one account since date_from.
export const POST = handle(async (req) => {
  const { uid, date_from } = (await req.json()) as { uid: string; date_from: string };
  const balances = await eb<{ balances: { balance_amount: Amount; balance_type: string }[] }>(`/accounts/${uid}/balances`);

  const transactions: Tx[] = [];
  let key: string | undefined;
  for (let page = 0; page < 20; page++) {
    const q = new URLSearchParams({ date_from, ...(key ? { continuation_key: key } : {}) });
    const data = await eb<{ transactions: Tx[]; continuation_key?: string }>(`/accounts/${uid}/transactions?${q}`);
    transactions.push(...data.transactions);
    key = data.continuation_key;
    if (!key) break;
  }

  return {
    balance: balances.balances[0]?.balance_amount ?? null,
    transactions: transactions
      .filter((t) => t.status !== "PDNG")
      .map((t) => {
        const income = t.credit_debit_indicator === "CRDT";
        const counterparty = income ? t.debtor?.name : t.creditor?.name;
        const description = [counterparty, ...(t.remittance_information ?? [])].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
        const day = t.booking_date ?? t.value_date ?? t.transaction_date ?? "";
        return {
          id: t.entry_reference ?? t.transaction_id ?? `${day}|${description}|${t.transaction_amount.amount}`,
          day,
          income,
          amount: Math.abs(Number(t.transaction_amount.amount)),
          description: description || "Bank transaction",
        };
      }),
  };
});
