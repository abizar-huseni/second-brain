"use client";
// Shared bits for the device panels on Today and You.
import { supabase } from "./supabase";
import { signApproval } from "./approver";

export type DeviceInfo = {
  agent?: string;
  kind?: string;
  host?: string;
  battery?: number;
  charging?: boolean;
  disk_free?: number;
  disk_total?: number;
  screen_off_min?: number;
  shell?: boolean;
  trusted?: string[];
  vault?: { path: string; last_sync: number | null; notes: number } | null;
};
export type Device = { id: string; name: string; kind: "windows" | "android" | "other"; last_seen: string | null; info: DeviceInfo | null; created_at: string };
export type DeviceAction = {
  id: string;
  device_id: string;
  created_at: string;
  source: "me" | "ai" | "device";
  action: string;
  params: Record<string, unknown>;
  title: string;
  why: string | null;
  status: "proposed" | "approved" | "running" | "done" | "failed" | "rejected" | "expired";
  finished_at: string | null;
  result: string | null;
  expires_at: string | null;
};

export const KIND_ICON = { windows: "💻", android: "📱", other: "🖥️" } as const;

// Seen in the last 2 minutes (the agent checks in every 15 seconds).
export const isOnline = (d: Device) => Boolean(d.last_seen && Date.now() - Date.parse(d.last_seen) < 2 * 60 * 1000);

export async function loadDevices() {
  const { data, error } = await supabase.from("devices").select("id, name, kind, last_seen, info, created_at").eq("revoked", false).order("created_at");
  if (error) throw new Error(/devices/.test(error.message) ? "The agent's database tables aren't in yet. They go in with the next deploy (supabase/009_agent.sql)." : error.message);
  return (data ?? []) as Device[];
}

export async function approve(a: DeviceAction) {
  const signed = await signApproval({ id: a.id, device_id: a.device_id, action: a.action, params: a.params });
  const { error } = await supabase.from("device_actions").update({ status: "approved", ...signed }).eq("id", a.id).eq("status", "proposed");
  if (error) throw new Error(error.message);
  return signed.key_id;
}

export async function reject(a: DeviceAction) {
  const { error } = await supabase.from("device_actions").update({ status: "rejected" }).eq("id", a.id);
  if (error) throw new Error(error.message);
}
