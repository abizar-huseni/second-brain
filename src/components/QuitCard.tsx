"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { cleanFor, hoursSince, MILESTONES, nextMilestone, saved, type Quit } from "@/lib/quit";
import { gbp } from "@/lib/money";
import CravingSOS from "./CravingSOS";

// Live "clean for" clock on Today, with the craving SOS one tap away.
export default function QuitCard({ compact = false }: { compact?: boolean }) {
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

  if (quit === undefined) return compact ? <div className="skeleton h-[104px] rounded-[1.35rem]" /> : null;
  if (!quit && compact) {
    return (
      <Link href="/quit" className="card card-link block">
        <p className="label">🚭 Quit</p>
        <p className="text-sm font-medium">Quitting something?</p>
        <p className="text-xs muted">Start a quit, get an SOS button.</p>
      </Link>
    );
  }
  if (!quit) {
    return (
      <Link href="/quit" className="card card-link flex items-center gap-3">
        <span className="text-2xl">🚭</span>
        <span className="flex-1 text-sm">
          <span className="block font-medium">Quitting something?</span>
          <span className="text-xs muted">Nicotine, junk food... Start a quit and get a craving SOS button.</span>
        </span>
        <span className="text-xs muted">→</span>
      </Link>
    );
  }

  const hours = hoursSince(quit.started_at, now);
  const next = nextMilestone(hours);
  const prev = [...MILESTONES].reverse().find((m) => m.hours <= hours)?.hours ?? 0;
  const pct = next ? ((hours - prev) / (next.hours - prev)) * 100 : 100;

  const sosSheet = sos && (
    <CravingSOS
      quit={quit}
      onClose={(changed) => {
        setSos(false);
        if (changed) load();
      }}
    />
  );

  if (compact) {
    return (
      <>
        <div className="card relative overflow-hidden !border-sky-400/10 !bg-gradient-to-br from-sky-500/15 to-rose-500/10">
          <Link href="/quit" className="block">
            <p className="label">🚭 {quit.name}-free</p>
            <p className="text-2xl font-semibold tracking-tight num">{cleanFor(hours)}</p>
            <p className="text-xs muted">
              {Number(quit.cost_per_week) > 0 ? `${gbp(saved(quit, hours))} saved` : next ? `${next.title} in ${cleanFor(next.hours - hours)}` : "Keep going"}
            </p>
          </Link>
          <button
            onClick={() => setSos(true)}
            className="mt-2 w-full rounded-xl bg-rose-500 py-1.5 text-xs font-semibold text-white shadow-md shadow-rose-500/25 transition active:scale-95"
          >
            I&apos;m craving
          </button>
          <div className="absolute inset-x-0 bottom-0 h-1 bg-sky-500/10">
            <div className="h-full bg-sky-400 transition-all duration-1000" style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
        </div>
        {sosSheet}
      </>
    );
  }

  return (
    <>
      <div className="card space-y-3 !bg-gradient-to-br from-sky-500/10 to-transparent">
        <Link href="/quit" className="flex items-start justify-between">
          <div>
            <p className="label">🚭 {quit.name}-free</p>
            <p className="text-3xl font-semibold tabular-nums">{cleanFor(hours)}</p>
          </div>
          {Number(quit.cost_per_week) > 0 && (
            <div className="text-right">
              <p className="text-xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{gbp(saved(quit, hours))}</p>
              <p className="text-xs muted">saved</p>
            </div>
          )}
        </Link>
        {next && (
          <div>
            <div className="mb-1 flex justify-between text-xs muted">
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
      {sosSheet}
    </>
  );
}
