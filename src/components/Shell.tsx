"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { buzz, openQuickAdd } from "@/lib/feel";
import Aurora from "./Aurora";
import Nav from "./Nav";
import QuickAdd from "./QuickAdd";
import TopBar from "./TopBar";
import { SubTabsProvider } from "@/lib/subtabs";

const STALE_MS = 10 * 60 * 1000;
const PULL = 70;

// Everything around the page: background, nav, top bar and capture sheet.
// Also: a light buzz on every tap (Android), N to capture on a laptop, pull down to refresh
// (installed apps lose the browser's own), and Today refreshes itself when you come back to it.
export default function Shell({ email, children }: { email: string; children: React.ReactNode }) {
  const path = usePathname();
  const [epoch, setEpoch] = useState(0);
  const [pull, setPull] = useState(0);
  const hiddenAt = useRef(0);
  const initial = (email.trim()[0] ?? "Y").toUpperCase();

  // Haptic tick on any button or link.
  useEffect(() => {
    const on = (e: PointerEvent) => {
      if (e.pointerType === "touch" && (e.target as Element).closest?.("button, a, [role=button]")) buzz(6);
    };
    document.addEventListener("pointerdown", on, { passive: true });
    return () => document.removeEventListener("pointerdown", on);
  }, []);

  // N (or /) opens capture when you're not typing.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.key === "n" || e.key === "/") {
        e.preventDefault();
        openQuickAdd();
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  // Coming back to Today after a while shows fresh data, not this morning's.
  useEffect(() => {
    const on = () => {
      if (document.hidden) hiddenAt.current = Date.now();
      else if (hiddenAt.current && Date.now() - hiddenAt.current > STALE_MS && location.pathname === "/") setEpoch((n) => n + 1);
    };
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);

  // Pull to refresh, only from the very top and never from inside a text box.
  useEffect(() => {
    let startY: number | null = null;
    let dist = 0;
    const start = (e: TouchEvent) => {
      const t = e.target as HTMLElement;
      startY = window.scrollY <= 0 && !t.closest("input, textarea, select, [data-no-pull]") ? e.touches[0].clientY : null;
      dist = 0;
    };
    const move = (e: TouchEvent) => {
      if (startY === null) return;
      dist = Math.max(0, (e.touches[0].clientY - startY) * 0.5);
      if (dist > 0 && window.scrollY <= 0) setPull(Math.min(dist, PULL * 1.4));
    };
    const end = () => {
      if (startY !== null && dist >= PULL) {
        buzz([10, 40, 10]);
        setEpoch((n) => n + 1);
      }
      startY = null;
      dist = 0;
      setPull(0);
    };
    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", end);
    window.addEventListener("touchcancel", end);
    return () => {
      window.removeEventListener("touchstart", start);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
      window.removeEventListener("touchcancel", end);
    };
  }, []);

  return (
    <SubTabsProvider>
      <Aurora />
      <Nav initial={initial} />
      {pull > 0 && (
        <div className="pointer-events-none fixed inset-x-0 top-[env(safe-area-inset-top)] z-30 flex justify-center" style={{ transform: `translateY(${pull - 30}px)` }}>
          <span
            className={`glass flex h-10 w-10 items-center justify-center rounded-full text-xl shadow-lg transition ${pull >= PULL ? "scale-110" : ""}`}
            style={{ transform: `rotate(${pull * 4}deg)` }}
          >
            {pull >= PULL ? "🧠" : "↻"}
          </span>
        </div>
      )}
      <div className="sm:pl-20 lg:pl-60">
        <TopBar initial={initial} />
        <main key={`${path}-${epoch}`} className="page-in mx-auto max-w-3xl px-4 pb-36 pt-2 sm:pb-16">
          {children}
        </main>
      </div>
      <QuickAdd />
    </SubTabsProvider>
  );
}
