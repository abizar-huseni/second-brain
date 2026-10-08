"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { lday, TZ } from "@/lib/ldates";
import type { Brief } from "@/lib/coach";
import { callApi, NOT_CONFIGURED } from "@/lib/api";
import { useAssistantName } from "@/lib/useAssistant";
import Cited from "./Cited";

const AREA_ICON: Record<string, string> = { growth: "🌱", fitness: "💪", mind: "🧠", money: "💷", work: "💼" };

// One brief per morning and one per evening, saved in the database. The heartbeat writes them at 7am and 6pm
// London time and sends the push, so the app only makes one itself once that time has passed.
const londonHour = () => Number(new Date().toLocaleString("en-GB", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }));

export default function CoachCard() {
  const name = useAssistantName();
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);
  const [early, setEarly] = useState("");

  const load = useCallback(async (fresh = false) => {
    if (!fresh) {
      const hour = londonHour();
      const slot = hour < 15 ? "am" : "pm";
      const { data } = await supabase.from("briefs").select("content").eq("day", lday()).eq("slot", slot).maybeSingle();
      if (data?.content) return setBrief(data.content as Brief);
      // Too early for this slot: leave it to the heartbeat and show the latest brief (today's or yesterday's) meanwhile.
      if (hour < (slot === "am" ? 7 : 18)) {
        const { data: last } = await supabase
          .from("briefs")
          .select("content")
          .gte("day", lday(-1))
          .order("day", { ascending: false })
          .order("slot", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (last?.content) setBrief(last.content as Brief);
        else setEarly(slot === "am" ? "7am" : "6pm");
        return;
      }
    }
    setLoading(true);
    setError("");
    try {
      const { brief } = await callApi<{ brief: Brief }>("/api/coach", { mode: "brief" });
      setBrief(brief);
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function ask() {
    if (!question.trim()) return;
    setAsking(true);
    setAnswer("");
    try {
      setAnswer((await callApi<{ answer: string }>("/api/coach", { mode: "ask", question })).answer);
    } catch (e) {
      setAnswer((e as Error).message === "not_configured" ? "Switch on the AI first (see above)." : (e as Error).message);
    }
    setAsking(false);
  }

  if (error === "not_configured") {
    return (
      <div className="card space-y-1 border-dashed">
        <p className="label">🧠 {name}</p>
        <p className="text-sm">{NOT_CONFIGURED}</p>
      </div>
    );
  }

  return (
    <div className="card space-y-3 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-500/10 dark:to-zinc-900">
      <div className="flex items-center justify-between">
        <p className="label mb-0">🧠 {name}&apos;s brief</p>
        <button onClick={() => load(true)} disabled={loading} className="text-xs text-zinc-500 disabled:opacity-50">
          {loading ? "Thinking…" : "↻ New brief"}
        </button>
      </div>

      {loading && !brief && (
        <div className="space-y-2">
          <div className="skeleton h-5 w-4/5" />
          <div className="skeleton h-12" />
          <div className="skeleton h-12" />
          <div className="skeleton h-12" />
        </div>
      )}
      {error && <p className="text-sm text-amber-600">{error}</p>}
      {!brief && !loading && !error && early && <p className="text-sm text-zinc-500">Your brief lands at {early}. Tap New brief for one now.</p>}

      {brief && (
        <div key={brief.headline} className="stagger space-y-2">
          <p className="text-lg font-semibold leading-snug"><Cited text={brief.headline} /></p>
          {brief.focus.map((f, i) => (
            <div key={i} className="flex gap-3 rounded-xl bg-white/70 p-3 dark:bg-zinc-800/60">
              <span className="text-xl">{AREA_ICON[f.area ?? ""] ?? "👉"}</span>
              <div>
                <p className="text-sm font-medium"><Cited text={f.title} /></p>
                <p className="text-xs text-zinc-500"><Cited text={f.why} /></p>
              </div>
            </div>
          ))}
          {brief.win && <p className="text-sm">🏆 <Cited text={brief.win} /></p>}
          {brief.watch_out && <p className="text-sm">⚠️ <Cited text={brief.watch_out} /></p>}
        </div>
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask();
        }}
      >
        <input className="input" placeholder={`Ask ${name} anything…`} value={question} onChange={(e) => setQuestion(e.target.value)} />
        <button className="btn shrink-0" disabled={asking}>
          {asking ? "…" : "Ask"}
        </button>
      </form>
      {answer && <p className="rise whitespace-pre-line rounded-xl bg-white/70 p-3 text-sm dark:bg-zinc-800/60">{answer}</p>}
    </div>
  );
}
