"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { tap } from "@/lib/haptics";

// Five places, nothing more. Everything else lives inside them.
const LINKS = [
  { href: "/", label: "Today", icon: "☀️", match: ["/", "/checkin"] },
  { href: "/plan", label: "Plan", icon: "🎯", match: ["/plan", "/goals"] },
  { href: "/notes", label: "Mind", icon: "🧠", match: ["/notes"] },
  { href: "/health", label: "Body", icon: "🫀", match: ["/health", "/quit", "/habits"] },
  { href: "/money", label: "Money", icon: "💷", match: ["/money"] },
];

export default function Nav() {
  const path = usePathname();
  const found = LINKS.findIndex((l) => l.match.includes(path));
  const active = Math.max(0, found);
  return (
    <>
      {/* Phone: a floating glass bar with a sliding highlight. */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] sm:hidden">
        <div className="glass-strong relative mx-auto flex max-w-md items-center rounded-[1.6rem] border p-1.5 shadow-2xl shadow-black/20 backdrop-blur-2xl">
          <span
            aria-hidden
            className="absolute inset-y-1.5 left-1.5 rounded-[1.2rem] bg-zinc-900/[0.06] transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] dark:bg-white/10"
            style={{ width: `calc((100% - 0.75rem) / ${LINKS.length})`, transform: `translateX(${active * 100}%)`, opacity: found < 0 ? 0 : 1 }}
          />
          {LINKS.map((l, i) => {
            const on = i === found;
            return (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => tap()}
                aria-current={on ? "page" : undefined}
                className={`relative z-10 flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium transition ${on ? "" : "muted"}`}
              >
                <span className={`text-[1.3rem] leading-none transition duration-300 ${on ? "-translate-y-0.5 scale-110" : "opacity-60 grayscale"}`}>{l.icon}</span>
                {l.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Laptop: a quiet top bar. */}
      <nav aria-label="Main" className="sticky top-0 z-30 hidden border-b backdrop-blur-xl sm:block" style={{ borderColor: "var(--border)" }}>
        <div className="mx-auto flex max-w-3xl items-center gap-1 px-4 py-2.5">
          <Link href="/" className="mr-4 font-semibold tracking-tight">
            <span className="gradient-text">●</span> Second Brain
          </Link>
          {LINKS.map((l) => {
            const on = l.match.includes(path);
            return (
              <Link key={l.href} href={l.href} className={`rounded-xl px-3 py-1.5 text-sm transition ${on ? "bg-zinc-900/[0.06] font-medium dark:bg-white/10" : "muted hover:text-current"}`}>
                {l.label}
              </Link>
            );
          })}
          <Link href="/me" aria-label="Me and settings" className={`ml-auto rounded-xl px-3 py-1.5 text-sm ${path === "/me" ? "bg-zinc-900/[0.06] dark:bg-white/10" : "muted"}`}>
            ⚙︎ Me
          </Link>
        </div>
      </nav>
    </>
  );
}
