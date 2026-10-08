"use client";
// Today's mindset fuel: swipe through a quote, a book in 60 seconds, a short video and a podcast.
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { callApi, errorText } from "@/lib/api";
import type { Fuel } from "@/lib/fuel";
import { tap } from "@/lib/haptics";

export default function FuelCard() {
  const [fuel, setFuel] = useState<Fuel | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [slide, setSlide] = useState(0);
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase
      .from("plans")
      .select("content, period")
      .eq("kind", "fuel")
      .order("period", { ascending: false })
      .limit(1)
      .then(({ data }) => setFuel((data?.[0]?.content as Fuel) ?? null));
  }, []);

  async function refresh() {
    setBusy(true);
    setError("");
    tap();
    try {
      const { fuel: f } = await callApi<{ fuel: Fuel }>("/api/fuel");
      setFuel(f);
      strip.current?.scrollTo({ left: 0, behavior: "smooth" });
    } catch (e) {
      setError(errorText(e));
    }
    setBusy(false);
  }

  function onScroll() {
    const el = strip.current;
    if (el) setSlide(Math.round(el.scrollLeft / el.clientWidth));
  }

  if (fuel === undefined) return <div className="skeleton h-44 rounded-[1.35rem]" />;
  if (!fuel)
    return (
      <div className="card flex items-center justify-between gap-3">
        <div>
          <p className="label">⚡ Mindset fuel</p>
          <p className="text-sm muted">A quote, a book in 60 seconds, a video and a podcast, picked for your day.</p>
          {error && <p className="mt-1 text-sm text-amber-500">{error}</p>}
        </div>
        <button className="btn-accent shrink-0" disabled={busy} onClick={refresh}>
          {busy ? "Picking…" : "Fuel me"}
        </button>
      </div>
    );

  const slides = [
    <div key="q" className="flex h-full flex-col justify-center">
      <p className="font-serif text-[1.35rem] italic leading-snug">“{fuel.quote.text}”</p>
      <p className="mt-3 text-sm muted">— {fuel.quote.by}</p>
    </div>,
    <div key="b" className="space-y-2">
      <p className="text-sm">
        <span className="font-semibold">📖 {fuel.book.title}</span> <span className="muted">· {fuel.book.author}</span>
      </p>
      <ol className="space-y-1.5 text-sm">
        {fuel.book.ideas.map((idea, i) => (
          <li key={i} className="flex gap-2">
            <span className="gradient-text font-semibold num">{i + 1}</span>
            <span>{idea}</span>
          </li>
        ))}
      </ol>
      {fuel.book.why && <p className="text-xs muted">{fuel.book.why}</p>}
    </div>,
    <a key="w" href={fuel.watch.url} target="_blank" rel="noreferrer" className="group flex h-full items-center gap-4">
      <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-rose-500 to-orange-400 text-2xl text-white shadow-lg transition group-active:scale-95">▶</span>
      <span>
        <span className="block font-semibold">{fuel.watch.title}</span>
        <span className="block text-sm muted">{fuel.watch.why}</span>
        <span className="mt-1 block text-xs text-rose-500">Watch on YouTube ↗</span>
      </span>
    </a>,
    <a key="l" href={fuel.listen.url} target="_blank" rel="noreferrer" className="group flex h-full items-center gap-4">
      <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-400 text-2xl text-white shadow-lg transition group-active:scale-95">🎧</span>
      <span>
        <span className="block font-semibold">{fuel.listen.show}</span>
        <span className="block text-sm">{fuel.listen.episode}</span>
        <span className="block text-sm muted">{fuel.listen.why}</span>
        <span className="mt-1 block text-xs text-emerald-500">Listen ↗</span>
      </span>
    </a>,
  ];

  return (
    <div className="card !p-0">
      <div className="flex items-center justify-between px-4 pt-4">
        <p className="label !mb-0">⚡ {fuel.theme || "Mindset fuel"}</p>
        <button className="text-xs muted transition active:scale-95" disabled={busy} onClick={refresh} aria-label="Get new mindset fuel">
          {busy ? "…" : "↻ another"}
        </button>
      </div>
      <div ref={strip} onScroll={onScroll} className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto scroll-smooth">
        {slides.map((s, i) => (
          <div key={i} className="min-h-[150px] w-full shrink-0 snap-center px-4 py-3">
            {s}
          </div>
        ))}
      </div>
      <div className="flex justify-center gap-1.5 pb-3">
        {["Quote", "Book", "Watch", "Listen"].map((n, i) => (
          <button
            key={n}
            aria-label={n}
            onClick={() => strip.current?.scrollTo({ left: i * strip.current.clientWidth, behavior: "smooth" })}
            className={`h-1.5 rounded-full transition-all ${slide === i ? "w-5 bg-emerald-400" : "w-1.5 bg-zinc-400/40"}`}
          />
        ))}
      </div>
      {error && <p className="px-4 pb-3 text-sm text-amber-500">{error}</p>}
    </div>
  );
}
