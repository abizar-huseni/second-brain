"use client";
// Your approval key. Each browser you approve from makes its own P-256 key pair; the private half
// is stored non-extractable in this browser's IndexedDB and never leaves it. Only the public half
// goes to the database. The device agent checks every approval against the keys it trusts locally.
import { supabase } from "./supabase";

const DB = "second-brain-approver";
const STORE = "keys";
const ALG = { name: "ECDSA", namedCurve: "P-256" } as const;

export type Approver = { id: string; name: string; pub: JsonWebKey; keys: CryptoKeyPair };

// Same canonical form as the agent: sorted keys, no spaces.
export function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}

export const approvalMessage = (a: { id: string; device_id: string; action: string; params: unknown; approved_at: string }) =>
  stable(["second-brain-approval-v1", a.id, a.device_id, a.action, a.params ?? {}, a.approved_at]);

export const b64url = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function keyId(pub: JsonWebKey) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${pub.x}.${pub.y}`));
  return b64url(hash).slice(0, 16);
}

export async function sha256Hex(text: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const req = run(open.result.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    };
  });
}

export function browserName() {
  const ua = navigator.userAgent;
  const os = /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /iPhone|iPad/.test(ua) ? "iPhone" : /Mac/.test(ua) ? "Mac" : "Linux";
  const br = /Edg\//.test(ua) ? "Edge" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : "Safari";
  return `${br} on ${os}`;
}

// Loads this browser's key, or makes one and registers its public half.
export async function getApprover(): Promise<Approver> {
  let keys = await idb<CryptoKeyPair | undefined>("readonly", (s) => s.get("approver")).catch(() => undefined);
  if (!keys) {
    keys = (await crypto.subtle.generateKey(ALG, false, ["sign", "verify"])) as CryptoKeyPair;
    await idb("readwrite", (s) => s.put(keys, "approver"));
  }
  const full = await crypto.subtle.exportKey("jwk", keys.publicKey);
  const pub: JsonWebKey = { kty: "EC", crv: "P-256", x: full.x, y: full.y };
  const id = await keyId(pub);
  const { data } = await supabase.from("approver_keys").select("id").eq("id", id).maybeSingle();
  if (!data) {
    const { error } = await supabase.from("approver_keys").insert({ id, name: browserName(), public_key: pub });
    if (error && !/duplicate/i.test(error.message)) throw new Error(error.message);
  }
  return { id, name: browserName(), pub, keys };
}

export async function signApproval(a: { id: string; device_id: string; action: string; params: unknown }) {
  const me = await getApprover();
  const approved_at = new Date().toISOString();
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, me.keys.privateKey, new TextEncoder().encode(approvalMessage({ ...a, approved_at })));
  return { approved_at, key_id: me.id, signature: b64url(sig) };
}
