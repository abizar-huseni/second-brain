// Server-only helpers for the Enable Banking API (UK open banking).
// Needs two Vercel env vars: ENABLE_BANKING_APP_ID and ENABLE_BANKING_PRIVATE_KEY (the .pem file contents).
import { createSign } from "crypto";
import { createClient } from "@supabase/supabase-js";

const API = "https://api.enablebanking.com";

const b64url = (input: string | Buffer) => Buffer.from(input).toString("base64url");

function jwt(): string {
  const appId = process.env.ENABLE_BANKING_APP_ID;
  const key = process.env.ENABLE_BANKING_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!appId || !key) throw new Error("Bank sync isn't set up yet: add ENABLE_BANKING_APP_ID and ENABLE_BANKING_PRIVATE_KEY in Vercel.");
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ typ: "JWT", alg: "RS256", kid: appId }));
  const body = b64url(JSON.stringify({ iss: "enablebanking.com", aud: "api.enablebanking.com", iat: now, exp: now + 3600 }));
  const signature = createSign("RSA-SHA256").update(`${header}.${body}`).sign(key);
  return `${header}.${body}.${b64url(signature)}`;
}

export async function eb<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(API + path, {
    ...init,
    headers: { Authorization: `Bearer ${jwt()}`, "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Bank API ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

// Only signed-in users of this app may call the bank routes.
export async function requireUser(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return null;
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!);
  const { data } = await supabase.auth.getUser(token);
  return data.user;
}

export function handle(fn: (req: Request) => Promise<unknown>) {
  return async (req: Request) => {
    try {
      if (!(await requireUser(req))) return Response.json({ error: "Not signed in" }, { status: 401 });
      return Response.json(await fn(req));
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 500 });
    }
  };
}
