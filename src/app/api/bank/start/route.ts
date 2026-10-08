import { eb, handle } from "@/lib/enablebanking";

// Starts a bank login. Returns the URL to send you to (your bank's own login page).
export const POST = handle(async (req) => {
  const { bank, state } = (await req.json()) as { bank: string; state: string };
  const origin = new URL(req.url).origin;
  const validUntil = new Date(Date.now() + 89 * 24 * 3600 * 1000).toISOString(); // UK consent lasts up to 90 days
  return eb<{ url: string }>("/auth", {
    method: "POST",
    body: JSON.stringify({
      access: { valid_until: validUntil },
      aspsp: { name: bank, country: "GB" },
      state,
      redirect_url: `${origin}/bank/callback`,
      psu_type: "personal",
    }),
  });
});
