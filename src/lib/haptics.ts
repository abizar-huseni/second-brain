"use client";
// A tiny buzz on taps that matter (Android phones; ignored elsewhere).
export function tap(ms: number | number[] = 8) {
  try {
    navigator.vibrate?.(ms);
  } catch {}
}
export const success = () => tap([10, 40, 18]);
