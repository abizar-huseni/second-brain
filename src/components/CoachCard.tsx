"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { toDay } from "@/lib/dates";
import type { Brief } from "@/lib/coach";

const AREA_ICON: Record<string, string> = { growth: "🌱", fitness: "💪", mind: "🧠", money: "💷", work: "💼" };

// One brief per morning and one per evening, cached on this device to save the free AI quota.
const cacheKey = () => `coach:${toDay()}:${new Date().getHours() < 15 ? "am" : "pm"}`;

async function callCoach(body: object) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch("/api/coach", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 501) throw new Error("not_configured");
  if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`);
  return json;
}

export default function CoachCard() {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);

  const load = useCallback(async (fresh = false) => {
    if (!fresh) {
      try {
        const cached = localStorage.getItem(cacheKey());
        if (cached) return setBrief(JSON.parse(cached));
      } catch {}
    }
    setLoading(true);
    setError("");
    try {
      const { brief } = await callCoach({ mode: "brief" });
      setBrief(brief);
      try {
        localStorage.setItem(cacheKey(), JSON.stringify(brief));
      } catch {}
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
      setAnswer((await callCoach({ mode: "ask", question })).answer);
    } catch (e) {
      setAnswer((e as Error).message === "not_configured" ? "Switch on your coach first (see above)." : (e as Error).message);
    }
    setAsking(false);
  }

  if (error === "not_configured") {
    return (
      <div className="card space-y-1 border-dashed">
        <p className="label">🤖 Your AI coach</p>
        <p className="text-sm">Switch it on for free: get a key at aistudio.google.com, add it in Vercel as AI_API_KEY, then redeploy.</p>
      </div>
    );
  }

  return (
    <div className="card space-y-3 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-500/10 dark:to-zinc-900">
      <div className="flex items-center justify-between">
        <p className="label mb-0">🤖 Your coach</p>
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

      {brief && (
        <div key={brief.headline} className="stagger space-y-2">
          <p className="text-lg font-semibold leading-snug">{brief.headline}</p>
          {brief.focus.map((f, i) => (
            <div key={i} className="flex gap-3 rounded-xl bg-white/70 p-3 dark:bg-zinc-800/60">
              <span className="text-xl">{AREA_ICON[f.area ?? ""] ?? "👉"}</span>
              <div>
                <p className="text-sm font-medium">{f.title}</p>
                <p className="text-xs text-zinc-500">{f.why}</p>
              </div>
            </div>
          ))}
          {brief.win && <p className="text-sm">🏆 {brief.win}</p>}
          {brief.watch_out && <p className="text-sm">⚠️ {brief.watch_out}</p>}
        </div>
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask();
        }}
      >
        <input className="input" placeholder="Ask your coach anything…" value={question} onChange={(e) => setQuestion(e.target.value)} />
        <button className="btn shrink-0" disabled={asking}>
          {asking ? "…" : "Ask"}
        </button>
      </form>
      {answer && <p className="rise whitespace-pre-line rounded-xl bg-white/70 p-3 text-sm dark:bg-zinc-800/60">{answer}</p>}
    </div>
  );
}
