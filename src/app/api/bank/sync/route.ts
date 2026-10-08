import { fetchBankData } from "@/lib/lunchflow";
import { userDb } from "@/lib/serverDb";

// Returns every connected account with its balance and transactions since `from`.
export async function POST(req: Request) {
  try {
    if (!(await userDb(req))) return Response.json({ error: "Not signed in" }, { status: 401 });
    const { from } = (await req.json()) as { from?: string };
    if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) return Response.json({ error: "Bad date" }, { status: 400 });
    return Response.json({ accounts: await fetchBankData(from) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
