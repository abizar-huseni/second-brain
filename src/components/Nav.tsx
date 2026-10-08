"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";

const LINKS = [
  { href: "/", label: "Today" },
  { href: "/checkin", label: "Check in" },
  { href: "/habits", label: "Habits" },
  { href: "/goals", label: "Goals" },
  { href: "/notes", label: "Notes" },
  { href: "/money", label: "Money" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-200 bg-white/90 backdrop-blur sm:static sm:border-0 sm:border-b dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="mx-auto flex max-w-3xl items-center justify-around gap-0.5 px-1 py-2 sm:justify-start sm:gap-4 sm:px-4">
        <span className="hidden font-semibold sm:mr-4 sm:inline">Second Brain</span>
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-lg px-2 py-2 text-xs sm:px-3 sm:text-sm ${
              path === l.href ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "text-zinc-600 dark:text-zinc-400"
            }`}
          >
            {l.label}
          </Link>
        ))}
        <button onClick={() => supabase.auth.signOut()} className="hidden text-sm text-zinc-500 sm:ml-auto sm:inline">
          Sign out
        </button>
      </div>
    </nav>
  );
}
