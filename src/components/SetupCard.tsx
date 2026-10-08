"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Step = { key: string; icon: string; title: string; why: string; href: string; done: boolean };

const HIDE_KEY = "setup-hidden-until";

// One-time steps that switch things on. Each ticks itself from real data, and the card
// goes away for good once they're all done (or for a week if you hide it).
export default function SetupCard() {
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      setHidden(Number(localStorage.getItem(HIDE_KEY) ?? 0) > Date.now());
    } catch {
      setHidden(false);
    }
    (async () => {
      const [profile, sync, devices, keep] = await Promise.all([
        supabase.from("profile").select("situation_confirmed_at").maybeSingle(),
        supabase.from("sync_status").select("source, last_ok"),
        supabase.from("devices").select("id").eq("revoked", false).limit(1),
        supabase.from("notes").select("id").eq("source", "keep").limit(1),
      ]);
      const synced = (s: string) => !!sync.data?.some((r) => r.source === s && r.last_ok);
      setSteps([
        { key: "dates", icon: "🎓", title: "Confirm your dates", why: "Dissertation, course end and visa: unlocks your countdown and work-hour checks.", href: "/me#situation", done: !!profile.data?.situation_confirmed_at },
        { key: "watch", icon: "⌚", title: "Connect your watch", why: "Sleep, steps and heart rate come in on their own.", href: "/me#connections", done: synced("watch") },
        { key: "google", icon: "📧", title: "Connect Gmail and Calendar", why: "Your brain sees bills, shifts and deadlines before you do.", href: "/me#connections", done: synced("google") },
        { key: "devices", icon: "💻", title: "Pair your laptop or phone", why: "Your brain suggests fixes, you tap yes.", href: "/me#devices", done: !!devices.data?.length },
        { key: "keep", icon: "🗒️", title: "Bring in your Keep notes", why: "Your old thoughts, filed and searchable.", href: "/notes#keep", done: !!keep.data?.length },
      ]);
    })();
  }, []);

  if (!steps || hidden) return null;
  const left = steps.filter((s) => !s.done);
  if (!left.length) return null;
  const doneCount = steps.length - left.length;
  const next = left[0];

  return (
    <section className="card space-y-3">
      <div className="flex items-center gap-3">
        <SetupRing done={doneCount} total={steps.length} />
        <button className="min-w-0 flex-1 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <p className="text-sm font-semibold">Finish setting up · {doneCount} of {steps.length}</p>
          <p className="truncate text-xs text-zinc-500">
            Next: {next.icon} {next.title}
          </p>
        </button>
        <button onClick={() => setOpen((o) => !o)} aria-label={open ? "Collapse" : "Show all steps"} className={`text-zinc-400 transition ${open ? "rotate-180" : ""}`}>
          ⌄
        </button>
      </div>

      {open ? (
        <ul className="stagger space-y-1.5">
          {steps.map((s) => (
            <li key={s.key}>
              <Link href={s.href} className={`flex items-center gap-3 rounded-2xl p-2.5 transition active:scale-[0.98] ${s.done ? "opacity-50" : "bg-zinc-500/5 hover:bg-zinc-500/10"}`}>
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm ${s.done ? "accent-fill text-white" : "bg-[var(--surface)] ring-1 ring-[var(--line)]"}`}>{s.done ? "✓" : s.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm font-medium ${s.done ? "line-through" : ""}`}>{s.title}</span>
                  {!s.done && <span className="block text-xs text-zinc-500">{s.why}</span>}
                </span>
                {!s.done && <span className="text-zinc-400">→</span>}
              </Link>
            </li>
          ))}
          <li className="pt-1 text-right">
            <button
              className="text-xs text-zinc-500"
              onClick={() => {
                try {
                  localStorage.setItem(HIDE_KEY, String(Date.now() + 7 * 86400000));
                } catch {}
                setHidden(true);
              }}
            >
              Hide for a week
            </button>
          </li>
        </ul>
      ) : (
        <Link href={next.href} className="btn btn-accent block text-center">
          {next.icon} {next.title} →
        </Link>
      )}
    </section>
  );
}

function SetupRing({ done, total }: { done: number; total: number }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-11 w-11 shrink-0">
      <svg viewBox="0 0 40 40" className="h-full w-full -rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="4" />
        <circle cx="20" cy="20" r={r} fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - done / total)} className="transition-all duration-700" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold tabular-nums">
        {done}/{total}
      </span>
    </div>
  );
}
