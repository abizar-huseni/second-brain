"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { callApi, errorText } from "@/lib/api";
import { cleanFor, hoursSince, nextMilestone, saved, TRIGGERS, type Quit } from "@/lib/quit";
import { gbp } from "@/lib/money";
import Confetti from "./Confetti";

const TACTICS: Record<string, string[]> = {
  bar: ["Hold your drink with both hands.", "When people head out to smoke, go to the bar or the loo instead.", "Next round: water or lime soda. Alcohol is what weakens you here.", "Chew gum. Keep your mouth busy."],
  "friends vaping": ["Say it out loud: \"I've quit.\" It makes it real.", "Step away for 3 minutes until this passes.", "Mints or gum in your pocket, every time you go out."],
  stress: ["Breathe with the circle until the timer ends.", "Cold water on your face or a cold drink.", "Walk around the block. Stress drops, so does the craving."],
  "after food": ["Get up from the table now.", "Brush your teeth or chew mint gum.", "5-minute walk."],
  boredom: ["20 push-ups. Right now.", "Text someone back.", "One SQL practice question. Five minutes."],
  morning: ["Change the order: shower first, coffee somewhere new.", "Big glass of water.", "Get outside for 5 minutes of daylight."],
  other: ["Delay 5 minutes, then decide again.", "Drink water slowly.", "Move your body."],
};

const PHASES = ["Breathe in", "Hold", "Breathe out", "Hold"];

// The "I'm craving" screen: ride out the few minutes a craving lasts, remember why, log what happened.
export default function CravingSOS({ quit, onClose }: { quit: Quit; onClose: (changed: boolean) => void }) {
  const [left, setLeft] = useState(180);
  const [phase, setPhase] = useState(0);
  const [trigger, setTrigger] = useState<string | null>(null);
  const [strength, setStrength] = useState<number | null>(null);
  const [talk, setTalk] = useState("");
  const [asking, setAsking] = useState(false);
  const [done, setDone] = useState<"" | "beaten" | "slipped">("");
  const [beatenCount, setBeatenCount] = useState(0);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    const p = setInterval(() => setPhase((x) => (x + 1) % 4), 4000);
    return () => {
      clearInterval(t);
      clearInterval(p);
    };
  }, []);

  const hours = hoursSince(quit.started_at);
  const next = nextMilestone(hours);

  async function ask() {
    setAsking(true);
    try {
      const where = trigger ? ` I'm in this situation: ${trigger}.` : "";
      const { answer } = await callApi<{ answer: string }>("/api/coach", {
        mode: "ask",
        question: `I'm craving nicotine right now.${where} I've been clean for ${cleanFor(hours)}. Get me through the next 5 minutes. Be short, direct and specific to me.`,
      });
      setTalk(answer);
    } catch (e) {
      setTalk(errorText(e));
    }
    setAsking(false);
  }

  async function finish(outcome: "beaten" | "slipped") {
    if (outcome === "slipped" && !confirm("Log a slip? Your clock restarts, your record stays.")) return;
    await supabase.from("cravings").insert({ quit_id: quit.id, strength, trigger, outcome });
    if (outcome === "slipped") {
      await supabase.from("quits").update({ started_at: new Date().toISOString(), longest_hours: Math.max(Number(quit.longest_hours), hours) }).eq("id", quit.id);
    } else {
      const { count } = await supabase.from("cravings").select("id", { count: "exact", head: true }).eq("quit_id", quit.id).eq("outcome", "beaten");
      setBeatenCount(count ?? 1);
    }
    setDone(outcome);
  }

  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, "0");

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-900 text-white">
      {done === "beaten" && <Confetti />}
      <div className="mx-auto flex min-h-full max-w-md flex-col gap-5 px-5 pb-10 pt-[calc(1.5rem+env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <p className="text-sm text-white/60">🚭 Clean for {cleanFor(hours)}</p>
          <button onClick={() => onClose(!!done)} className="text-sm text-white/60">
            Close
          </button>
        </div>

        {done ? (
          <div className="celebrate space-y-3 py-10 text-center">
            <p className="text-6xl">{done === "beaten" ? "💪" : "🫡"}</p>
            <p className="text-2xl font-semibold">{done === "beaten" ? "Craving beaten." : "One slip isn't a relapse."}</p>
            <p className="text-white/70">
              {done === "beaten"
                ? `That's ${beatenCount} you've beaten. Each one makes the next one weaker.`
                : "Your clock restarts now and your record stays. Your brain will look at what set it off and plan around it."}
            </p>
            <button className="mt-4 rounded-xl bg-white px-6 py-3 font-medium text-slate-900" onClick={() => onClose(true)}>
              Back to it
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center gap-3 py-2">
              <div className="relative flex h-56 w-56 items-center justify-center">
                <div className="breathe absolute inset-0 rounded-full bg-gradient-to-br from-emerald-400/40 to-sky-400/40 blur-[2px]" />
                <div className="breathe absolute inset-6 rounded-full border-2 border-white/40" />
                <div className="relative text-center">
                  <p className="text-lg font-medium">{left ? PHASES[phase] : "It passed."}</p>
                  <p className="text-4xl font-semibold tabular-nums">{mm}:{ss}</p>
                </div>
              </div>
              <p className="text-center text-sm text-white/70">Cravings last a few minutes. Ride this one out with the circle.</p>
            </div>

            <div className="space-y-2 rounded-2xl bg-white/10 p-4">
              {quit.why && <p className="text-lg font-medium leading-snug">“{quit.why}”</p>}
              <p className="text-sm text-white/80">
                {Number(quit.cost_per_week) > 0 && <>💷 {gbp(saved(quit, hours))} saved so far. </>}
                {next && <>⏭️ {next.title} in {cleanFor(next.hours - hours)}.</>}
              </p>
            </div>

            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-white/50">What set it off?</p>
              <div className="flex flex-wrap gap-2">
                {TRIGGERS.map((t) => (
                  <button key={t} onClick={() => setTrigger(t)} className={`rounded-full px-3 py-1.5 text-sm transition ${trigger === t ? "bg-white text-slate-900" : "bg-white/10"}`}>
                    {t}
                  </button>
                ))}
              </div>
              {trigger && (
                <ul className="rise mt-3 space-y-1.5">
                  {TACTICS[trigger].map((x) => (
                    <li key={x} className="text-sm">
                      👉 {x}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-white/50">How strong?</p>
              <div className="flex gap-2">
                {[
                  [1, "Mild"],
                  [3, "Strong"],
                  [5, "Brutal"],
                ].map(([v, l]) => (
                  <button key={v} onClick={() => setStrength(Number(v))} className={`flex-1 rounded-xl py-2 text-sm ${strength === v ? "bg-white text-slate-900" : "bg-white/10"}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={ask} disabled={asking} className="rounded-xl bg-white/10 py-3 text-sm">
              {asking ? "Thinking…" : "🧠 Talk me through it"}
            </button>
            {talk && <p className="rise whitespace-pre-line rounded-2xl bg-white/10 p-4 text-sm">{talk}</p>}

            <button onClick={() => finish("beaten")} className="rounded-2xl bg-emerald-500 py-4 text-lg font-semibold shadow-lg shadow-emerald-500/30 active:scale-[0.98]">
              I beat it 💪
            </button>
            <button onClick={() => finish("slipped")} className="text-sm text-white/50 underline">
              I slipped
            </button>
          </>
        )}
      </div>
    </div>
  );
}
