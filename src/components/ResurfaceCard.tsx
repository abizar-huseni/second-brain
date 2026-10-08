"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { toDay } from "@/lib/dates";
import { timeAgo } from "@/lib/time";

type Thought = { id: string; body: string; title: string | null; kind: string | null; created_at: string; last_surfaced: string | null };

// Brings back one old thought a day (ideas, goals, worries) so good ones don't die in a list.
export default function ResurfaceCard() {
  const [t, setT] = useState<Thought | null>(null);
  const [gone, setGone] = useState("");

  useEffect(() => {
    const today = toDay();
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
    supabase
      .from("notes")
      .select("id, body, title, kind, created_at, last_surfaced")
      .in("kind", ["idea", "goal", "worry"])
      .lt("created_at", threeDaysAgo)
      .order("last_surfaced", { ascending: true, nullsFirst: true })
      .order("created_at")
      .limit(1)
      .then(({ data, error }) => {
        const pick = error ? null : data?.[0];
        if (!pick) return;
        // Same thought all day; a different one tomorrow.
        if (pick.last_surfaced && pick.last_surfaced > toDay(new Date(Date.now() - 14 * 86400000)) && pick.last_surfaced !== today) return;
        setT(pick);
        if (pick.last_surfaced !== today) supabase.from("notes").update({ last_surfaced: today }).eq("id", pick.id).then(() => {});
      });
  }, []);

  if (!t) return null;
  if (gone) return <p className="rise text-center text-sm text-zinc-500">{gone}</p>;

  async function toTask() {
    await supabase.from("tasks").insert({ title: t!.title || t!.body.slice(0, 120), day: null });
    setGone("Moved to Someday on your Plan. ✅");
  }
  async function letGo() {
    await supabase.from("notes").update({ kind: "archived" }).eq("id", t!.id);
    setGone("Let it go. 🍃");
  }

  return (
    <div className="card space-y-2 bg-gradient-to-br from-violet-50 to-white dark:from-violet-500/10 dark:to-zinc-900">
      <p className="label">💭 Remember this? · {timeAgo(t.created_at)}</p>
      {t.title && <p className="font-semibold">{t.title}</p>}
      <p className="whitespace-pre-line text-sm text-zinc-600 dark:text-zinc-300">{t.body}</p>
      <div className="flex gap-2 pt-1">
        <button onClick={toTask} className="rounded-lg bg-violet-600 px-3 py-1 text-xs font-medium text-white active:scale-95">
          Act on it
        </button>
        <button onClick={() => setGone("Kept. It'll come back another day.")} className="rounded-lg border border-zinc-300 px-3 py-1 text-xs dark:border-zinc-700">
          Keep
        </button>
        <button onClick={letGo} className="rounded-lg border border-zinc-300 px-3 py-1 text-xs dark:border-zinc-700">
          Let go
        </button>
      </div>
    </div>
  );
}
