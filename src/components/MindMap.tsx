"use client";

import type { Note } from "@/lib/types";

const W = 400;
const H = 400;
const C = { x: W / 2, y: H / 2 };

// Radial map: you in the middle, one branch per #tag, a dot per note on that branch.
// Untagged notes sit on an "inbox" branch so nothing gets lost.
export default function MindMap({
  notes,
  selected,
  onSelect,
}: {
  notes: Note[];
  selected: string | null;
  onSelect: (tag: string | null) => void;
}) {
  const counts = new Map<string, number>();
  for (const n of notes) {
    const tags = n.tags.length ? n.tags : ["inbox"];
    for (const t of tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const tags = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
  const max = Math.max(1, ...tags.map(([, c]) => c));

  if (!tags.length) {
    return <p className="py-10 text-center text-sm text-zinc-500">Add a note with a #tag and your map starts growing.</p>;
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto w-full max-w-md select-none">
      {tags.map(([tag, count], i) => {
        const angle = (i / tags.length) * Math.PI * 2 - Math.PI / 2;
        const x = C.x + Math.cos(angle) * 135;
        const y = C.y + Math.sin(angle) * 135;
        const r = 18 + (count / max) * 16;
        const active = selected === tag;
        const dots = Math.min(count, 8);
        return (
          <g key={tag} className="cursor-pointer" onClick={() => onSelect(active ? null : tag)}>
            <line x1={C.x} y1={C.y} x2={x} y2={y} className="stroke-zinc-500/30" strokeWidth={1 + (count / max) * 3} />
            {Array.from({ length: dots }, (_, d) => {
              const a = angle + ((d - (dots - 1) / 2) * 0.35);
              return <circle key={d} cx={x + Math.cos(a) * (r + 12)} cy={y + Math.sin(a) * (r + 12)} r={3} className="fill-emerald-400/60" />;
            })}
            <circle cx={x} cy={y} r={r} className={`transition-colors ${active ? "fill-[var(--accent)]" : "fill-zinc-500/15"}`} />
            <text x={x} y={y - 2} textAnchor="middle" className={`text-[10px] font-medium ${active ? "fill-white" : "fill-[var(--fg)]"}`}>
              {tag.length > 10 ? tag.slice(0, 9) + "…" : tag}
            </text>
            <text x={x} y={y + 10} textAnchor="middle" className={`text-[9px] ${active ? "fill-white" : "fill-zinc-500"}`}>{count}</text>
          </g>
        );
      })}
      <g className="cursor-pointer" onClick={() => onSelect(null)}>
        <circle cx={C.x} cy={C.y} r={30} className="fill-[var(--fg)]" />
        <text x={C.x} y={C.y + 4} textAnchor="middle" className="fill-[var(--bg)] text-xs font-semibold">Me</text>
      </g>
    </svg>
  );
}
