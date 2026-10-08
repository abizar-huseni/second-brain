"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { toDay } from "@/lib/dates";
import { timeAgo } from "@/lib/time";

type Thought = { id: string; body: string; title: string | null; kind: string | null; created_at: string; last_surfaced: string | null };

const DONE_KEY = "resurface-done";
function doneOn() {
  try {
    return localStorage.getItem(DONE_KEY);
  } catch {
    return null;
  }
}

// Brings back one old thought a day (ideas, goals, worries) so good ones don't die in a list.
export default function ResurfaceCard() {
  const [t, setT] = useState<Thought | null>(null);
  const [gone, setGone] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const today = toDay();
    if (doneOn() === today) return;
    const cutoff = toDay(new Date(Date.now() - 14 * 86400000));
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
    const base = () =>
      supabase
        .from("notes")
        .select("id, body, title, kind, created_at, last_surfaced")
        .in("kind", ["idea", "goal", "worry"])
        .lt("created_at", threeDaysAgo);
    (async () => {
      // Same thought all day: reuse today's pick if there is one.
      const cur = await base().eq("last_surfaced", today).order("created_at").limit(1);
      if (cur.error) return;
      if (cur.data?.[0]) return setT(cur.data[0]);
      // Otherwise the oldest one not shown in the last 14 days, claimed for today.
      const next = await base()
        .or(`last_surfaced.is.null,last_surfaced.lte.${cutoff}`)
        .order("last_surfaced", { ascending: true, nullsFirst: true })
        .order("created_at")
        .limit(1);
      const pick = next.error ? null : next.data?.[0];
      if (!pick) return;
      setT(pick);
      await supabase.from("notes").update({ last_surfaced: today }).eq("id", pick.id);
    })();
  }, []);

  if (!t) return null;
  if (gone) return <p className="rise text-center text-sm text-zinc-500">{gone}</p>;

  // Once you've answered today's thought, don't show it (or another) again until tomorrow.
  function done(text: string) {
    setGone(text);
    try {
      localStorage.setItem(DONE_KEY, toDay());
    } catch {}
  }
  async function toTask() {
    setBusy(true); // a double tap would add the task twice
    await supabase.from("tasks").insert({ title: t!.title || t!.body.slice(0, 120), day: null });
    done("Moved to Someday on your Plan. ✅");
  }
  async function letGo() {
    setBusy(true);
    await supabase.from("notes").update({ kind: "archived" }).eq("id", t!.id);
    done("Let it go. 🍃");
  }

  return (
    <div className="card space-y-2 bg-gradient-to-br from-violet-50 to-white dark:from-violet-500/10 dark:to-zinc-900">
      <p className="label">💭 Remember this? · {timeAgo(t.created_at)}</p>
      {t.title && <p className="font-semibold">{t.title}</p>}
      <p className="whitespace-pre-line text-sm text-zinc-600 dark:text-zinc-300">{t.body}</p>
      <div className="flex gap-2 pt-1">
        <button onClick={toTask} disabled={busy} className="rounded-lg bg-violet-600 px-3 py-1 text-xs font-medium text-white active:scale-95">
          Act on it
        </button>
        <button onClick={() => done("Kept. It'll come back another day.")} disabled={busy} className="rounded-lg border border-zinc-300 px-3 py-1 text-xs dark:border-zinc-700">
          Keep
        </button>
        <button onClick={letGo} disabled={busy} className="rounded-lg border border-zinc-300 px-3 py-1 text-xs dark:border-zinc-700">
          Let go
        </button>
      </div>
    </div>
  );
}
