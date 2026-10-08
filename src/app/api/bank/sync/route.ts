import { fetchBankData, requireUser } from "@/lib/lunchflow";

// Returns every connected account with its balance and transactions since `from`.
export async function POST(req: Request) {
  try {
    if (!(await requireUser(req))) return Response.json({ error: "Not signed in" }, { status: 401 });
    const { from } = (await req.json()) as { from: string };
    return Response.json({ accounts: await fetchBankData(from) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
