"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { groupFor, ME, pageFor } from "@/lib/nav";
import { buzz } from "@/lib/feel";
import { useActiveSubTabs } from "@/lib/subtabs";
import { useFadeRight } from "@/lib/useFadeRight";
import { Avatar } from "./Nav";
import ThemeToggle from "./ThemeToggle";

// Title of the place you're in, its pages as pills, and (on the phone) theme + you.
export default function TopBar({ initial }: { initial: string }) {
  const fade = useFadeRight<HTMLDivElement>();
  const path = usePathname();
  const group = groupFor(path);
  const page = pageFor(path);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  const title = group?.label ?? page?.label ?? "";
  const sub = useActiveSubTabs();
  const pills = group && (group.pages.length > 1 || sub) ? group.pages : null;

  return (
    <header className={`sticky top-0 z-10 pt-[env(safe-area-inset-top)] transition-all duration-300 ${scrolled ? "glass border-b border-[var(--line)]" : ""}`}>
      <div className="mx-auto max-w-3xl px-4">
        <div className="flex h-14 items-center gap-2">
          {path === "/" && <span className="brain-mark text-xl sm:hidden">🧠</span>}
          <h1 key={title} className="rise flex-1 truncate text-xl font-semibold tracking-tight">
            {path === "/" ? (
              <>
                <span className="sm:hidden">Second Brain</span>
                <span className="hidden sm:inline">Today</span>
              </>
            ) : (
              title
            )}
          </h1>
          <div className="flex items-center gap-1 sm:hidden">
            <ThemeToggle />
            <Link href={ME.pages[0].href} aria-label="You">
              <Avatar initial={initial} on={path === "/me"} />
            </Link>
          </div>
        </div>
        {pills && (
          <div ref={fade} className="no-scrollbar fade-right -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-3">
            {pills.map((p) => {
              const on = page?.href === p.href;
              // The open page's own views sit inside its pill, so there's only ever one row.
              if (on && sub) {
                return (
                  <div key={p.href} className="flex shrink-0 items-center gap-0.5 rounded-full bg-[var(--fg)] p-0.5 shadow-sm">
                    {sub.tabs.map((t) => (
                      <button
                        key={t.key}
                        onClick={() => {
                          buzz();
                          sub.pick(t.key);
                        }}
                        aria-pressed={sub.active === t.key}
                        className={`rounded-full px-2.5 py-1 text-[13px] transition active:scale-95 ${sub.active === t.key ? "bg-[var(--bg)] font-semibold text-[var(--fg)]" : "text-[var(--bg)]/70"}`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                );
              }
              return (
                <Link
                  key={p.href}
                  href={p.href}
                  aria-current={on ? "page" : undefined}
                  className={`shrink-0 rounded-full px-4 py-1.5 text-sm transition active:scale-95 ${on ? "bg-[var(--fg)] font-medium text-[var(--bg)] shadow-sm" : "bg-[var(--card)] text-zinc-500 ring-1 ring-[var(--line)]"}`}
                >
                  {p.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </header>
  );
}
