"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { toDay } from "@/lib/dates";
import { addDays } from "@/lib/ldates";
import { extractTags } from "@/lib/notes";
import { EXPENSE_CATEGORIES } from "@/lib/money";
import { callApi } from "@/lib/api";
import { useSpeech } from "@/lib/useSpeech";

const MODES = [
  { key: "thought", label: "💭 Thought" },
  { key: "task", label: "✅ Task" },
  { key: "spent", label: "💷 Spent" },
] as const;
type Mode = (typeof MODES)[number]["key"];

// The capture sheet behind the + button: catch a thought (typed or spoken), a task or an expense in seconds.
// Also opens straight into "thought" from the home-screen shortcut (?add=thought).
export default function QuickAdd() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("thought");
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("food");
  const [when, setWhen] = useState<"today" | "tomorrow">("today");
  const [done, setDone] = useState("");
  const [reply, setReply] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeIn = (ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(close, ms);
  };
  // Set while saving: words the recognizer finishes after Save must not land in the next thought.
  const muted = useRef(false);
  const busy = useRef(false);
  const speech = useSpeech((fin, int) => {
    if (muted.current) return;
    if (fin) setText((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}${fin.trim()}`);
    setInterim(int);
  });

  // The nav's + button, N on a keyboard, or any component can open this.
  useEffect(() => {
    const on = (e: Event) => {
      const m = (e as CustomEvent).detail;
      if (m === "thought" || m === "task" || m === "spent") setMode(m);
      setOpen(true);
    };
    window.addEventListener("quickadd", on);
    return () => window.removeEventListener("quickadd", on);
  }, []);

  useEffect(() => {
    const p = new URLSearchParams(location.search).get("add");
    if (p === "thought" || p === "task" || p === "spent") {
      setMode(p);
      setOpen(true);
      history.replaceState(null, "", location.pathname);
    }
  }, []);

  function close() {
    if (timer.current) clearTimeout(timer.current);
    speech.stop();
    setInterim("");
    setOpen(false);
    setReply("");
    setDone("");
  }

  async function save() {
    if (busy.current) return;
    // Save what's on screen, including words still being recognised.
    const body = (mode === "thought" && interim ? `${text} ${interim}` : text).trim();
    // Nothing on screen yet: stop, but let the late words land so the next tap saves them.
    if (mode === "thought" && !body) return speech.stop();
    muted.current = true;
    speech.stop();
    setText(body);
    setInterim("");
    busy.current = true;
    try {
      await write(body);
    } finally {
      busy.current = false;
    }
  }

  async function write(body: string) {
    if (mode === "thought" && body) {
      const { data, error } = await supabase.from("notes").insert({ body, tags: extractTags(body) }).select("id").single();
      if (error) return setDone(error.message);
      setText("");
      setDone("Caught it 💭");
      // Let the assistant file it and say how it'll use it.
      closeIn(5000);
      callApi<{ filed: { reply: string } | null }>("/api/remember", { id: data.id })
        .then(({ filed }) => {
          if (!filed?.reply) return;
          setReply(filed.reply);
          closeIn(3500);
        })
        .catch(() => {});
      return;
    }
    let error;
    if (mode === "task" && body) ({ error } = await supabase.from("tasks").insert({ title: body, day: when === "today" ? toDay() : addDays(toDay(), 1) }));
    else if (mode === "spent" && Number(amount) > 0) ({ error } = await supabase.from("transactions").insert({ kind: "expense", amount: Number(amount), category, note: body || null, day: toDay() }));
    else return;
    if (error) return setDone(error.message);
    setText("");
    setAmount("");
    setDone(mode === "spent" ? "Logged 💷" : "Added ✅");
    closeIn(900);
  }

  return (
    <>
      {open && (
        <div className="fade-in fixed inset-0 z-30 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center" onClick={close} onKeyDown={(e) => e.key === "Escape" && close()}>
          <div className="sheet w-full max-w-md space-y-3 rounded-t-[32px] border border-[var(--line)] bg-[var(--surface)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-[32px]" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto h-1 w-10 rounded-full bg-zinc-300 sm:hidden dark:bg-zinc-700" />
            <div className="flex gap-1 rounded-2xl bg-zinc-100 p-1 dark:bg-zinc-800">
              {MODES.map((m) => (
                <button key={m.key} onClick={() => setMode(m.key)} className={`flex-1 rounded-xl py-1.5 text-sm transition ${mode === m.key ? "bg-white font-semibold shadow-sm dark:bg-zinc-700" : "text-zinc-500"}`}>
                  {m.label}
                </button>
              ))}
            </div>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              {mode === "spent" && (
                <div className="flex gap-2">
                  <input className="input text-2xl font-semibold" type="number" inputMode="decimal" step="0.01" min="0" placeholder="£0.00" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
                  <select className="input w-36" value={category} onChange={(e) => setCategory(e.target.value)}>
                    {EXPENSE_CATEGORIES.filter((c) => c !== "transfer").map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
              )}
              {mode === "thought" ? (
                <div className="space-y-2">
                  <textarea
                    className="input min-h-28"
                    rows={4}
                    placeholder="Brilliant idea? Something about you it should remember? Just dump it."
                    value={interim ? `${text} ${interim}` : text}
                    onChange={(e) => setText(e.target.value)}
                    autoFocus={!speech.supported}
                  />
                  {speech.supported && (
                    <button
                      type="button"
                      onClick={() => {
                        if (speech.listening) return speech.stop();
                        muted.current = false;
                        speech.start();
                      }}
                      className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium transition ${speech.listening ? "bg-rose-500 text-white" : "bg-zinc-100 dark:bg-zinc-800"}`}
                    >
                      <span className={speech.listening ? "pop inline-block" : ""}>🎙️</span>
                      {speech.listening ? "Listening… tap to stop" : "Hold the thought: tap and talk"}
                    </button>
                  )}
                </div>
              ) : (
                <input className="input" placeholder={mode === "task" ? "What needs doing?" : "What was it? (optional)"} value={text} onChange={(e) => setText(e.target.value)} autoFocus={mode === "task"} />
              )}
              {mode === "task" && (
                <div className="flex gap-2">
                  {(["today", "tomorrow"] as const).map((w) => (
                    <button type="button" key={w} onClick={() => setWhen(w)} className={`chip flex-1 capitalize ${when === w ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10" : ""}`}>
                      {w}
                    </button>
                  ))}
                </div>
              )}
              <button className="btn btn-accent w-full py-3">{done || "Save"}</button>
              {reply && <p className="celebrate rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">🧠 {reply}</p>}
            </form>
          </div>
        </div>
      )}
    </>
  );
}
