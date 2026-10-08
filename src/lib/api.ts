"use client";
// Calls one of our server routes as the signed-in user.
import { supabase } from "./supabase";

export async function callApi<T = Record<string, unknown>>(path: string, body: object = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 501) throw new Error("not_configured");
  if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`);
  return json as T;
}

export const NOT_CONFIGURED = "Switch on the AI for free: get a key at aistudio.google.com, add it in Vercel as AI_API_KEY, then redeploy.";
export const errorText = (e: unknown) => ((e as Error).message === "not_configured" ? NOT_CONFIGURED : (e as Error).message);
