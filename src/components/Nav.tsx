"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Today", icon: "🏠" },
  { href: "/checkin", label: "Check in", icon: "✍️" },
  { href: "/habits", label: "Habits", icon: "✅" },
  { href: "/goals", label: "Goals", icon: "🎯" },
  { href: "/health", label: "Health", icon: "💪" },
  { href: "/notes", label: "Notes", icon: "🧠" },
  { href: "/money", label: "Money", icon: "💷" },
  { href: "/me", label: "Me", icon: "👤" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-200 bg-white/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg sm:static sm:border-0 sm:border-b sm:pb-0 dark:border-zinc-800 dark:bg-zinc-950/85">
      <div className="mx-auto flex max-w-3xl items-center px-1 py-1.5 sm:gap-1 sm:px-4 sm:py-2">
        <span className="hidden font-semibold sm:mr-4 sm:inline">🧠 Second Brain</span>
        {LINKS.map((l) => {
          const on = path === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1 text-[10px] transition sm:flex-none sm:flex-row sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-sm ${
                on ? "font-semibold text-emerald-700 dark:text-emerald-400 sm:bg-emerald-50 sm:dark:bg-emerald-500/10" : "text-zinc-500"
              }`}
            >
              <span className={`text-xl leading-none transition sm:text-base ${on ? "scale-110" : "opacity-70 grayscale-[40%]"}`}>{l.icon}</span>
              {l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
