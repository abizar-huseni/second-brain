"use client";

import { useCallback, useRef } from "react";

// For a sideways-scrolling row: fades the right edge only while something is hidden there,
// so a row that fits (or is scrolled to the end) shows its last chip in full.
//   <div ref={useFadeRight()} className="fade-right overflow-x-auto …">
export function useFadeRight<T extends HTMLElement>() {
  const off = useRef<() => void>(undefined);
  return useCallback((el: T | null) => {
    off.current?.();
    off.current = undefined;
    if (!el) return;
    const check = () => el.toggleAttribute("data-more", el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    const mo = new MutationObserver(check);
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    el.addEventListener("scroll", check, { passive: true });
    check();
    off.current = () => {
      ro.disconnect();
      mo.disconnect();
      el.removeEventListener("scroll", check);
    };
  }, []);
}
