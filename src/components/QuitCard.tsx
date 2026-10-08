"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { cleanFor, hoursSince, MILESTONES, nextMilestone, saved, type Quit } from "@/lib/quit";
import { gbp } from "@/lib/money";
import CravingSOS from "./CravingSOS";

// Live "clean for" clock on Today, with the craving SOS one tap away.
export default function QuitCard() {
  const [quit, setQuit] = useState<Quit | null | undefined>(undefined);
  const [now, setNow] = useState(() => Date.now());
  const [sos, setSos] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("quits").select("*").eq("active", true).order("created_at").limit(1).maybeSingle();
    setQuit(error ? null : data);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, [load]);

  // Home-screen shortcut "I'm craving" opens /quit?sos=1 straight into the SOS screen.
  useEffect(() => {
    if (quit && new URLSearchParams(location.search).get("sos") === "1") {
      setSos(true);
      history.replaceState(null, "", location.pathname);
    }
  }, [quit]);

  if (quit === undefined) return null;
  if (!quit) {
    return (
      <Link href="/quit" className="card card-link flex items-center gap-3">
        <span className="text-2xl">🚭</span>
        <span className="flex-1 text-sm">
          <span className="block font-medium">Quitting something?</span>
          <span className="text-xs text-zinc-500">Nicotine, junk food... Start a quit and get a craving SOS button.</span>
        </span>
        <span className="text-xs text-zinc-500">→</span>
      </Link>
    );
  }

  const hours = hoursSince(quit.started_at, now);
  const next = nextMilestone(hours);
  const prev = [...MILESTONES].reverse().find((m) => m.hours <= hours)?.hours ?? 0;
  const pct = next ? ((hours - prev) / (next.hours - prev)) * 100 : 100;

  return (
    <>
      <div className="card space-y-3 bg-gradient-to-br from-sky-50 to-white dark:from-sky-500/10 dark:to-zinc-900">
        <Link href="/quit" className="flex items-start justify-between">
          <div>
            <p className="label">🚭 {quit.name}-free</p>
            <p className="text-3xl font-semibold tabular-nums">{cleanFor(hours)}</p>
          </div>
          {Number(quit.cost_per_week) > 0 && (
            <div className="text-right">
              <p className="text-xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{gbp(saved(quit, hours))}</p>
              <p className="text-xs text-zinc-500">saved</p>
            </div>
          )}
        </Link>
        {next && (
          <div>
            <div className="mb-1 flex justify-between text-xs text-zinc-500">
              <span>Next: {next.title}</span>
              <span>in {cleanFor(next.hours - hours)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div className="h-full rounded-full bg-sky-500 transition-all duration-1000" style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
          </div>
        )}
        <button onClick={() => setSos(true)} className="w-full rounded-xl bg-rose-500 py-3 font-semibold text-white shadow-md shadow-rose-500/20 transition active:scale-[0.98]">
          I&apos;m craving
        </button>
      </div>
      {sos && (
        <CravingSOS
          quit={quit}
          onClose={(changed) => {
            setSos(false);
            if (changed) load();
          }}
        />
      )}
    </>
  );
}
