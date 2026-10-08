"use client";

// A short burst of emoji when you finish the day. Respects reduced motion via globals.css.
const BITS = ["🎉", "✨", "🔥", "💪", "⭐", "🎊"];

export default function Confetti() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {Array.from({ length: 28 }, (_, i) => {
        const x = ((i * 37) % 100) - 50;
        const delay = (i % 7) * 40;
        return (
          <span
            key={i}
            className="confetti absolute left-1/2 top-1/3 text-2xl"
            style={{ "--x": `${x * 7}px`, "--r": `${(i * 53) % 360}deg`, animationDelay: `${delay}ms` } as React.CSSProperties}
          >
            {BITS[i % BITS.length]}
          </span>
        );
      })}
    </div>
  );
}
