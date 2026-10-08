"use client";

import { faceFor, type Face } from "@/lib/moods";
import { buzz } from "@/lib/feel";

// Halo behind the chosen face, from rough day to great day.
const HALO = ["from-rose-400/40", "from-orange-400/40", "from-amber-300/40", "from-lime-400/40", "from-emerald-400/50"];

export default function EmojiScale({ label, scale, value, onChange }: { label: string; scale: Face[]; value: number | null; onChange: (v: number) => void }) {
  const picked = faceFor(scale, value);
  const idx = picked ? scale.indexOf(picked) : -1;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <label className="label mb-0">{label}</label>
        <span key={picked?.label} className={`text-sm font-semibold ${picked ? "pop inline-block" : "text-zinc-400"}`}>
          {picked?.label ?? "Tap one"}
        </span>
      </div>
      <div className="relative grid grid-cols-5 gap-2 rounded-3xl bg-zinc-500/5 p-1.5">
        {scale.map((f, i) => {
          const on = idx === i;
          return (
            <button
              key={f.value}
              type="button"
              aria-label={f.label}
              aria-pressed={on}
              onClick={() => {
                buzz(on ? 6 : [8, 30, 8]);
                onChange(f.value);
              }}
              className={`relative flex aspect-square items-center justify-center rounded-2xl text-3xl transition duration-300 sm:text-4xl ${
                on ? "bg-[var(--surface)] shadow-lg" : idx >= 0 ? "opacity-40 grayscale hover:opacity-80 hover:grayscale-0" : "hover:scale-105"
              }`}
            >
              {on && <span aria-hidden className={`absolute inset-0 rounded-2xl bg-radial ${HALO[i]} to-transparent`} />}
              <span key={on ? "on" : "off"} className={`relative inline-block ${on ? "pop" : ""}`}>
                {f.emoji}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
