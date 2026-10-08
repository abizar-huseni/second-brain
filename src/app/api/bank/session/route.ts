import { eb, handle } from "@/lib/enablebanking";

type Session = {
  session_id: string;
  aspsp: { name: string };
  access: { valid_until: string };
  accounts: { uid: string; name?: string; product?: string; currency?: string; account_id?: { iban?: string; other?: { identification?: string } } }[];
};

// Swaps the code your bank sends back for a session with your accounts in it.
export const POST = handle(async (req) => {
  const { code } = (await req.json()) as { code: string };
  const s = await eb<Session>("/sessions", { method: "POST", body: JSON.stringify({ code }) });
  return {
    session_id: s.session_id,
    bank: s.aspsp.name,
    valid_until: s.access.valid_until,
    accounts: s.accounts.map((a) => ({
      uid: a.uid,
      name: a.name || a.product || "Account",
      currency: a.currency ?? "GBP",
      last4: (a.account_id?.iban ?? a.account_id?.other?.identification ?? "").slice(-4),
    })),
  };
});
