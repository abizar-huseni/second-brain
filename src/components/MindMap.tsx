"use client";

import { useMemo } from "react";
import type { Note } from "@/lib/types";

const W = 400;
const H = 400;
const PAD = 44;
const MAX_TOPICS = 24;

type Topic = { tag: string; count: number; x: number; y: number; r: number };
type Link = { a: string; b: string; w: number };

// Topics are your #tags (the assistant adds 1-3 when it files a thought). Two topics are linked when
// the same notes carry both, and the more notes they share, the thicker the line and the closer they sit.
function build(notes: Note[]) {
  const counts = new Map<string, number>();
  for (const n of notes) for (const t of n.tags.length ? n.tags : ["inbox"]) counts.set(t, (counts.get(t) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_TOPICS);
  const keep = new Set(top.map(([t]) => t));

  const pair = new Map<string, number>();
  for (const n of notes) {
    const ts = [...new Set(n.tags)].filter((t) => keep.has(t)).sort();
    for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) pair.set(`${ts[i]}|${ts[j]}`, (pair.get(`${ts[i]}|${ts[j]}`) ?? 0) + 1);
  }
  const links: Link[] = [...pair].map(([k, w]) => {
    const [a, b] = k.split("|");
    return { a, b, w };
  });

  // A small force layout, run once: topics push apart, shared notes pull together, a gentle pull to the middle.
  const max = Math.max(1, ...top.map(([, c]) => c));
  const nodes = top.map(([tag, count], i) => {
    const angle = (i / top.length) * Math.PI * 2;
    const ring = 60 + (i % 3) * 40;
    return { tag, count, x: Math.cos(angle) * ring, y: Math.sin(angle) * ring, r: 13 + Math.sqrt(count / max) * 17 };
  });
  const at = new Map(nodes.map((n) => [n.tag, n]));
  for (let step = 0; step < 220; step++) {
    const cool = 1 - step / 240;
    const fx = new Map(nodes.map((n) => [n.tag, 0]));
    const fy = new Map(nodes.map((n) => [n.tag, 0]));
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const p = nodes[i];
        const q = nodes[j];
        const dx = p.x - q.x || 0.01;
        const dy = p.y - q.y || 0.01;
        const d2 = Math.max(dx * dx + dy * dy, 1);
        const push = (2600 + (p.r + q.r) * 60) / d2;
        fx.set(p.tag, fx.get(p.tag)! + dx * push);
        fy.set(p.tag, fy.get(p.tag)! + dy * push);
        fx.set(q.tag, fx.get(q.tag)! - dx * push);
        fy.set(q.tag, fy.get(q.tag)! - dy * push);
      }
    for (const l of links) {
      const p = at.get(l.a)!;
      const q = at.get(l.b)!;
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const pull = 0.012 * Math.min(4, l.w);
      fx.set(p.tag, fx.get(p.tag)! + dx * pull);
      fy.set(p.tag, fy.get(p.tag)! + dy * pull);
      fx.set(q.tag, fx.get(q.tag)! - dx * pull);
      fy.set(q.tag, fy.get(q.tag)! - dy * pull);
    }
    for (const n of nodes) {
      const vx = fx.get(n.tag)! - n.x * 0.02;
      const vy = fy.get(n.tag)! - n.y * 0.02;
      const v = Math.hypot(vx, vy);
      const lim = 12 * cool;
      n.x += v > lim ? (vx / v) * lim : vx;
      n.y += v > lim ? (vy / v) * lim : vy;
    }
  }

  // Fit to the box.
  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scale = Math.min((W - PAD * 2) / Math.max(x1 - x0, 1), (H - PAD * 2) / Math.max(y1 - y0, 1), 1.6);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const topics: Topic[] = nodes.map((n) => ({ ...n, x: W / 2 + (n.x - cx) * scale, y: H / 2 + (n.y - cy) * scale }));

  // Then nudge apart any topics that still touch, so every label stays readable and tappable.
  for (let pass = 0; pass < 80; pass++) {
    let moved = false;
    for (let i = 0; i < topics.length; i++)
      for (let j = i + 1; j < topics.length; j++) {
        const p = topics[i];
        const q = topics[j];
        const dx = q.x - p.x || 0.01;
        const dy = q.y - p.y || 0.01;
        const d = Math.hypot(dx, dy);
        const gap = p.r + q.r + 6 - d;
        if (gap <= 0) continue;
        moved = true;
        const ux = (dx / d) * (gap / 2);
        const uy = (dy / d) * (gap / 2);
        p.x -= ux;
        p.y -= uy;
        q.x += ux;
        q.y += uy;
      }
    for (const t of topics) {
      t.x = Math.min(W - t.r - 2, Math.max(t.r + 2, t.x));
      t.y = Math.min(H - t.r - 2, Math.max(t.r + 2, t.y));
    }
    if (!moved) break;
  }
  return { topics, links, hidden: counts.size - top.length };
}

// A map of how your thoughts connect. Tap a topic to see its notes (dots around it, and the list below)
// and the topics it links to; tap a dot to jump to that note.
export default function MindMap({
  notes,
  selected,
  onSelect,
  onNote,
}: {
  notes: Note[];
  selected: string | null;
  onSelect: (tag: string | null) => void;
  onNote?: (id: string) => void;
}) {
  const { topics, links, hidden } = useMemo(() => build(notes), [notes]);
  const at = new Map(topics.map((t) => [t.tag, t]));
  const near = new Set(selected ? links.filter((l) => l.a === selected || l.b === selected).flatMap((l) => [l.a, l.b]) : []);
  const maxW = Math.max(1, ...links.map((l) => l.w));

  if (!topics.length) return <p className="py-10 text-center text-sm text-zinc-500">Add a note with a #tag and your map starts growing.</p>;

  const sel = selected ? at.get(selected) : undefined;
  const orbit = sel ? notes.filter((n) => (n.tags.length ? n.tags : ["inbox"]).includes(sel.tag)).slice(0, 12) : [];
  const related = sel ? [...near].filter((t) => t !== sel.tag) : [];
  // Note dots ring the selected topic, drawn on top so they stay tappable.
  const dot = (i: number) => {
    const a = (i / orbit.length) * Math.PI * 2 - Math.PI / 2;
    const d = sel!.r + 16;
    return [sel!.x + Math.cos(a) * d, sel!.y + Math.sin(a) * d];
  };

  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto w-full max-w-md touch-manipulation select-none" role="img" aria-label="Mind map of your notes">
        <rect width={W} height={H} fill="transparent" onClick={() => onSelect(null)} />
        {links.map((l) => {
          const p = at.get(l.a)!;
          const q = at.get(l.b)!;
          const on = selected && (l.a === selected || l.b === selected);
          return (
            <line
              key={`${l.a}|${l.b}`}
              x1={p.x}
              y1={p.y}
              x2={q.x}
              y2={q.y}
              strokeLinecap="round"
              strokeWidth={1 + (l.w / maxW) * 4}
              className={`transition-opacity duration-300 ${on ? "stroke-[var(--accent)] opacity-80" : "stroke-zinc-500 " + (selected ? "opacity-10" : "opacity-25")}`}
            />
          );
        })}

        {sel &&
          orbit.map((n, i) => {
            const [x, y] = dot(i);
            return <line key={n.id} x1={sel.x} y1={sel.y} x2={x} y2={y} className="fade-in stroke-[var(--accent)] opacity-40" />;
          })}

        {topics.map((t) => {
          const active = selected === t.tag;
          const dim = selected && !active && !near.has(t.tag);
          return (
            <g key={t.tag} className={`cursor-pointer transition-opacity duration-300 ${dim ? "opacity-30" : ""}`} onClick={() => onSelect(active ? null : t.tag)}>
              <circle cx={t.x} cy={t.y} r={t.r} className={`transition-colors duration-300 ${active ? "fill-[var(--accent)]" : near.has(t.tag) ? "fill-[var(--accent)]/25" : "fill-zinc-500/15"}`} />
              <text x={t.x} y={t.y - 1} textAnchor="middle" className={`pointer-events-none text-[10px] font-medium ${active ? "fill-white" : "fill-[var(--fg)]"}`}>
                {t.tag.length > 11 ? t.tag.slice(0, 10) + "…" : t.tag}
              </text>
              <text x={t.x} y={t.y + 10} textAnchor="middle" className={`pointer-events-none text-[9px] ${active ? "fill-white/80" : "fill-zinc-500"}`}>
                {t.count}
              </text>
            </g>
          );
        })}
        {sel &&
          orbit.map((n, i) => {
            const [x, y] = dot(i);
            return (
              <g key={n.id} className="fade-in cursor-pointer" onClick={() => onNote?.(n.id)}>
                <title>{n.title || n.body.slice(0, 60)}</title>
                <circle cx={x} cy={y} r={4.5} className="fill-[var(--accent)]" />
                <circle cx={x} cy={y} r={11} fill="transparent" />
              </g>
            );
          })}
      </svg>

      <p className="text-center text-xs text-zinc-500">
        {sel
          ? related.length
            ? <>Linked to {related.slice(0, 5).map((t, i) => <button key={t} className="font-medium text-[var(--accent)]" onClick={() => onSelect(t)}>{i ? ", " : ""}#{t}</button>)}. Tap a dot to open a note.</>
            : "Tap a dot to open a note."
          : `Tap a topic. Lines join topics that share notes.${hidden > 0 ? ` ${hidden} smaller topics are in the list.` : ""}`}
      </p>
    </div>
  );
}
