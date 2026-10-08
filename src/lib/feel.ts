// Small things that make the app feel alive: haptics, theme and the time-of-day mood.

// A tiny tap you feel on Android. iPhones and laptops just ignore it.
export function buzz(ms: number | number[] = 8) {
  try {
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) navigator.vibrate?.(ms);
  } catch {}
}

export type ThemePref = "system" | "light" | "dark";

export function getThemePref(): ThemePref {
  try {
    const p = localStorage.getItem("theme");
    return p === "light" || p === "dark" ? p : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(pref: ThemePref) {
  try {
    if (pref === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", pref);
  } catch {}
  const dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;
  root.dataset.theme = dark ? "dark" : "light";
  root.style.colorScheme = dark ? "dark" : "light";
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", dark ? "#0b0b10" : "#f4f3ef"));
}

// Dawn, day, dusk or night: tints the background and the Today hero.
export type Sky = "dawn" | "day" | "dusk" | "night";
export function skyFor(hour = new Date().getHours()): Sky {
  if (hour >= 5 && hour < 11) return "dawn";
  if (hour >= 11 && hour < 17) return "day";
  if (hour >= 17 && hour < 22) return "dusk";
  return "night";
}

// Opens the capture sheet from anywhere (nav button, keyboard, other components).
export const openQuickAdd = (mode?: "thought" | "task" | "spent") => window.dispatchEvent(new CustomEvent("quickadd", { detail: mode }));
