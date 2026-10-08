"use client";

import { useEffect } from "react";
import { skyFor } from "@/lib/feel";

// Soft drifting colour behind everything, tinted by the time of day.
// Pure CSS gradients (no blur filters) so it stays smooth on a phone.
export default function Aurora() {
  useEffect(() => {
    const set = () => (document.documentElement.dataset.sky = skyFor());
    set();
    const t = setInterval(set, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="aurora-blob aurora-a" />
      <div className="aurora-blob aurora-b" />
      <div className="aurora-blob aurora-c" />
    </div>
  );
}
