"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GROUPS, ME, groupFor } from "@/lib/nav";
import { buzz, openQuickAdd } from "@/lib/feel";
import ThemeToggle from "./ThemeToggle";

// Phone: a floating bar with the four places and a big capture button in the middle.
// Laptop: a quiet rail down the left.
export default function Nav({ initial }: { initial: string }) {
  const path = usePathname();
  const active = groupFor(path)?.key;
  const [left, right] = [GROUPS.slice(0, 2), GROUPS.slice(2)];

  const item = (g: (typeof GROUPS)[number]) => {
    const on = active === g.key;
    return (
      <Link
        key={g.key}
        href={g.pages[0].href}
        aria-current={on ? "page" : undefined}
        className={`group relative flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[11px] font-medium transition ${on ? "text-[var(--fg)]" : "text-zinc-500"}`}
      >
        <span className={`text-[22px] leading-none transition duration-300 ${on ? "-translate-y-0.5 scale-110" : "opacity-60 grayscale group-active:scale-90"}`}>{g.icon}</span>
        {g.label}
        <span className={`absolute -bottom-0.5 h-1 w-1 rounded-full bg-[var(--accent)] transition duration-300 ${on ? "scale-100 opacity-100" : "scale-0 opacity-0"}`} />
      </Link>
    );
  };

  return (
    <>
      {/* Phone */}
      <nav className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-20 sm:hidden" aria-label="Main">
        <div className="glass flex items-center rounded-[28px] px-2 py-1.5 shadow-xl shadow-black/10">
          {left.map(item)}
          <button
            onClick={() => {
              buzz(12);
              openQuickAdd();
            }}
            aria-label="Capture a thought, task or spend"
            className="accent-fill mx-1 flex h-14 w-14 shrink-0 -translate-y-3 items-center justify-center rounded-full text-3xl font-light text-white shadow-lg shadow-[var(--accent-glow)] ring-4 ring-[var(--bg)] transition active:scale-90"
          >
            +
          </button>
          {right.map(item)}
        </div>
      </nav>

      {/* Laptop / tablet */}
      <nav className="fixed inset-y-0 left-0 z-20 hidden w-20 flex-col items-center gap-1 border-r border-[var(--line)] py-5 sm:flex lg:w-60 lg:items-stretch lg:px-4" aria-label="Main">
        <Link href="/" className="mb-6 flex items-center gap-2 px-2 text-lg font-semibold tracking-tight">
          <span className="brain-mark text-2xl">🧠</span>
          <span className="hidden lg:inline">Second Brain</span>
        </Link>
        <button
          onClick={() => openQuickAdd()}
          className="accent-fill mb-4 flex h-11 w-11 items-center justify-center gap-2 rounded-2xl text-sm font-semibold text-white shadow-md shadow-[var(--accent-glow)] transition active:scale-95 lg:h-auto lg:w-full lg:justify-start lg:px-4 lg:py-2.5"
          title="Capture (press N)"
        >
          <span className="text-xl leading-none">+</span>
          <span className="hidden lg:inline">Capture</span>
          <kbd className="ml-auto hidden rounded-md bg-white/20 px-1.5 text-[10px] lg:inline">N</kbd>
        </button>
        {GROUPS.map((g) => {
          const on = active === g.key;
          return (
            <Link
              key={g.key}
              href={g.pages[0].href}
              aria-current={on ? "page" : undefined}
              title={g.label}
              className={`flex h-11 w-11 items-center justify-center gap-3 rounded-2xl text-sm transition lg:w-full lg:justify-start lg:px-4 ${on ? "bg-[var(--card)] font-semibold shadow-sm" : "text-zinc-500 hover:bg-[var(--card)]/60"}`}
            >
              <span className={`text-xl transition ${on ? "scale-110" : "opacity-70 grayscale"}`}>{g.icon}</span>
              <span className="hidden lg:inline">{g.label}</span>
            </Link>
          );
        })}
        <div className="mt-auto flex flex-col items-center gap-2 lg:flex-row lg:justify-between">
          <Link
            href={ME.pages[0].href}
            title="You"
            className={`flex items-center gap-3 rounded-2xl text-sm transition lg:px-2 lg:py-1.5 ${active === "me" ? "font-semibold" : "text-zinc-500"}`}
          >
            <Avatar initial={initial} on={active === "me"} />
            <span className="hidden lg:inline">You</span>
          </Link>
          <ThemeToggle />
        </div>
      </nav>
    </>
  );
}

export function Avatar({ initial, on }: { initial: string; on?: boolean }) {
  return (
    <span className={`accent-fill flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold uppercase text-white transition ${on ? "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg)]" : ""}`}>
      {initial}
    </span>
  );
}
