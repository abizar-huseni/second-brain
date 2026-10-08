"use client";
// The top of Today: your assistant's orb, its one-line read of your day, the 3 things that matter,
// and a place to ask it anything (typed or spoken).
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { toDay } from "@/lib/dates";
import type { Brief } from "@/lib/coach";
import { callApi, NOT_CONFIGURED } from "@/lib/api";
import { useAssistantName } from "@/lib/useAssistant";
import { useSpeech } from "@/lib/useSpeech";
import { tap } from "@/lib/haptics";
import Orb from "./Orb";
import Cited from "./Cited";

const AREA_ICON: Record<string, string> = { growth: "🌱", fitness: "💪", mind: "🧠", money: "💷", work: "💼" };
const slot = () => (new Date().getHours() < 15 ? "am" : "pm");

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Still up?" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function BrainHero({ score }: { score: number }) {
  const name = useAssistantName();
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);
  const speech = useSpeech((fin) => fin && setQuestion((q) => `${q} ${fin}`.trim()));

  const load = useCallback(async (fresh = false) => {
    if (!fresh) {
      const { data } = await supabase.from("briefs").select("content").eq("day", toDay()).eq("slot", slot()).maybeSingle();
      if (data?.content) return setBrief(data.content as Brief);
      // Nothing for this half of the day yet: show the latest one rather than spending AI on page load.
      const { data: last } = await supabase.from("briefs").select("content").order("day", { ascending: false }).order("slot", { ascending: false }).limit(1);
      if (last?.[0]?.content) return setBrief(last[0].content as Brief);
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

  async function ask(e?: React.FormEvent) {
    e?.preventDefault();
    if (!question.trim()) return;
    speech.stop();
    tap();
    setAsking(true);
    setAnswer("");
    try {
      setAnswer((await callApi<{ answer: string }>("/api/coach", { mode: "ask", question })).answer);
      setQuestion("");
    } catch (err) {
      setAnswer((err as Error).message === "not_configured" ? NOT_CONFIGURED : (err as Error).message);
    }
    setAsking(false);
  }

  const date = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const [first, ...rest] = brief?.focus ?? [];

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] muted">{date}</p>
          <h1 className="text-[1.7rem] font-semibold tracking-tight">{greeting()}</h1>
        </div>
        <Link href="/me" aria-label="Me and settings" className="grid h-10 w-10 place-items-center rounded-full border text-lg transition active:scale-90" style={{ borderColor: "var(--border)" }}>
          ⚙︎
        </Link>
      </header>

      <div className="card relative overflow-hidden !p-5">
        <div className="flex items-start gap-4">
          <button onClick={() => load(true)} disabled={loading} aria-label={`Ask ${name} for a fresh brief`} className="transition active:scale-90">
            <Orb size={52} thinking={loading || asking} hue={score >= 100 ? 40 : 0} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] gradient-text">{name}</p>
            {loading && !brief ? (
              <div className="mt-1 space-y-2">
                <div className="skeleton h-5 w-11/12" />
                <div className="skeleton h-5 w-3/5" />
              </div>
            ) : error === "not_configured" ? (
              <p className="mt-1 text-sm">{NOT_CONFIGURED}</p>
            ) : brief ? (
              <p key={brief.headline} className="fade mt-0.5 text-lg font-semibold leading-snug">
                <Cited text={brief.headline} />
              </p>
            ) : (
              <p className="mt-0.5 text-sm muted">Tap the orb and I&apos;ll read your day.</p>
            )}
            {error && error !== "not_configured" && <p className="mt-1 text-sm text-amber-500">{error}</p>}
          </div>
        </div>

        {first && (
          <div className="mt-4 space-y-2">
            <Focus f={first} />
            {open && rest.map((f, i) => <Focus key={i} f={f} />)}
            {open && brief?.win && <p className="fade text-sm">🏆 <Cited text={brief.win} /></p>}
            {open && brief?.watch_out && <p className="fade text-sm">⚠️ <Cited text={brief.watch_out} /></p>}
            {(rest.length > 0 || brief?.win || brief?.watch_out) && (
              <button className="text-xs muted" onClick={() => setOpen((o) => !o)}>
                {open ? "Less" : `+${rest.length} more`}
              </button>
            )}
          </div>
        )}

        <form onSubmit={ask} className="mt-4 flex items-center gap-2">
          <input
            className="input"
            placeholder={speech.listening ? "Listening…" : `Ask ${name} anything…`}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            aria-label={`Ask ${name}`}
          />
          {speech.supported && (
            <button
              type="button"
              aria-label={speech.listening ? "Stop listening" : "Speak"}
              onClick={() => (speech.listening ? speech.stop() : speech.start())}
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl border transition active:scale-90 ${speech.listening ? "border-rose-500 bg-rose-500 text-white" : ""}`}
              style={speech.listening ? undefined : { borderColor: "var(--border)" }}
            >
              🎙️
            </button>
          )}
          <button className="btn h-11 shrink-0" disabled={asking || !question.trim()}>
            {asking ? "…" : "Ask"}
          </button>
        </form>
        {answer && (
          <p className="rise mt-3 whitespace-pre-line rounded-2xl bg-zinc-500/10 p-3 text-sm">
            <Cited text={answer} />
          </p>
        )}
      </div>
    </section>
  );
}

function Focus({ f }: { f: Brief["focus"][number] }) {
  return (
    <div className="rise flex gap-3 rounded-2xl bg-zinc-500/[0.07] p-3">
      <span className="text-xl">{AREA_ICON[f.area ?? ""] ?? "👉"}</span>
      <div className="min-w-0">
        <p className="text-sm font-medium">{f.title}</p>
        <p className="text-xs muted">
          <Cited text={f.why} />
        </p>
      </div>
    </div>
  );
}
