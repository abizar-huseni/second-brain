"use client";

import { useEffect, useState } from "react";
import { applyTheme, buzz, getThemePref, type ThemePref } from "@/lib/feel";

const NEXT: Record<ThemePref, ThemePref> = { system: "light", light: "dark", dark: "system" };
const ICON: Record<ThemePref, string> = { system: "🌗", light: "☀️", dark: "🌙" };
const LABEL: Record<ThemePref, string> = { system: "Theme: follows your phone", light: "Theme: light", dark: "Theme: dark" };

// Cycles follow-the-phone, light and dark. Remembered on this device.
export default function ThemeToggle() {
  const [pref, setPref] = useState<ThemePref>("system");

  useEffect(() => {
    setPref(getThemePref());
    // Keep "system" in step when the phone flips to dark mode at night.
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => getThemePref() === "system" && applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <button
      onClick={() => {
        const p = NEXT[pref];
        buzz();
        applyTheme(p);
        setPref(p);
      }}
      title={LABEL[pref]}
      aria-label={LABEL[pref]}
      className="flex h-9 w-9 items-center justify-center rounded-full text-lg transition hover:bg-[var(--card)] active:scale-90"
    >
      <span key={pref} className="pop inline-block">
        {ICON[pref]}
      </span>
    </button>
  );
}
