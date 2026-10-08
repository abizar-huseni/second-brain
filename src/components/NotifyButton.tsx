"use client";

import { useEffect, useState } from "react";
import { callApi, errorText } from "@/lib/api";

const toKey = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

// Turns on phone notifications for this device.
export default function NotifyButton({ compact }: { compact?: boolean }) {
  const [state, setState] = useState<"unsupported" | "off" | "on" | "blocked" | "busy">("off");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState("unsupported");
    if (Notification.permission === "denied") return setState("blocked");
    navigator.serviceWorker.ready.then((r) => r.pushManager.getSubscription()).then((s) => setState(s ? "on" : "off"));
  }, []);

  async function enable() {
    setState("busy");
    setMsg("");
    try {
      if ((await Notification.requestPermission()) !== "granted") return setState("blocked");
      const { publicKey, error } = await fetch("/api/push/key").then((r) => r.json());
      if (!publicKey) throw new Error(error ?? "Couldn't get the notification key");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) });
      await callApi("/api/push/subscribe", { subscription: sub.toJSON() });
      setState("on");
    } catch (e) {
      setMsg(errorText(e));
      setState("off");
    }
  }

  if (state === "unsupported" || (compact && state !== "off")) return null;
  if (compact) {
    return (
      <button onClick={enable} className="card card-link flex w-full items-center gap-3 text-left">
        <span className="text-2xl">🔔</span>
        <span className="flex-1">
          <span className="block text-sm font-medium">Let your brain message you</span>
          <span className="block text-xs text-zinc-500">Morning brief, tomorrow&apos;s plan, and anything urgent it spots.</span>
        </span>
        <span className="text-sm text-emerald-700 dark:text-emerald-400">Turn on</span>
      </button>
    );
  }
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-medium">🔔 Notifications on this device</p>
        <p className="text-xs text-zinc-500">{state === "blocked" ? "Blocked in browser settings. Allow notifications for this site, then reload." : msg || "Brief at 7am, plan at 8pm, urgent things as they come."}</p>
      </div>
      {state === "on" ? <span className="chip border-emerald-500 text-emerald-700 dark:text-emerald-400">On ✓</span> : state !== "blocked" && <button className="btn shrink-0" disabled={state === "busy"} onClick={enable}>Turn on</button>}
    </div>
  );
}
