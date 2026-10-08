"use client";

import { faceFor, type Face } from "@/lib/moods";

export default function EmojiScale({ label, scale, value, onChange }: { label: string; scale: Face[]; value: number | null; onChange: (v: number) => void }) {
  const picked = faceFor(scale, value);
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <label className="label mb-0">{label}</label>
        <span className="text-sm text-zinc-500">{picked?.label ?? "Tap one"}</span>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {scale.map((f) => {
          const on = picked?.value === f.value;
          return (
            <button
              key={f.value}
              type="button"
              aria-label={f.label}
              aria-pressed={on}
              onClick={() => onChange(f.value)}
              className={`flex aspect-square items-center justify-center rounded-2xl text-3xl transition sm:text-4xl ${
                on ? "bg-emerald-100 ring-2 ring-emerald-500 dark:bg-emerald-500/20" : value == null ? "bg-zinc-100 dark:bg-zinc-800" : "bg-zinc-100 opacity-50 grayscale dark:bg-zinc-800"
              }`}
            >
              <span key={on ? "on" : "off"} className={on ? "pop inline-block" : "inline-block"}>
                {f.emoji}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
