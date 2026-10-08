// The assistant's "face": a softly breathing orb. Thinking makes it swirl faster.
export default function Orb({ size = 64, thinking = false, hue = 0 }: { size?: number; thinking?: boolean; hue?: number }) {
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size, filter: `hue-rotate(${hue}deg)` }} aria-hidden>
      <span className="glow absolute inset-[-25%] rounded-full bg-[radial-gradient(circle,rgb(52_211_153/0.45),rgb(34_211_238/0.18)_45%,transparent_70%)] blur-md" />
      <span
        className="absolute inset-0 rounded-full shadow-[inset_-6px_-8px_18px_rgb(0_0_0/0.25),inset_6px_6px_14px_rgb(255_255_255/0.35)]"
        style={{
          background: "conic-gradient(from 0deg, #34d399, #22d3ee, #a78bfa, #f472b6, #34d399)",
          animation: `spin ${thinking ? 2.2 : 14}s linear infinite`,
        }}
      />
      <span className="absolute inset-[18%] rounded-full bg-white/25 blur-[6px]" />
    </span>
  );
}
