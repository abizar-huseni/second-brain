// London calendar helpers that work the same on the server (UTC) and in the browser.
export const TZ = "Europe/London";

// Calendar-day arithmetic, so clock changes never skip or repeat a day.
export const lday = (offsetDays = 0) => addDays(new Date().toLocaleDateString("en-CA", { timeZone: TZ }), offsetDays);

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Monday of the week containing `day`.
export function weekStart(day: string): string {
  const dow = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7; // Mon = 0
  return addDays(day, -dow);
}

// Next due date after a bill is paid or its date passes.
// Months clamp to their last day (Jan 31 -> Feb 28, Feb 29 -> Feb 28 next year) instead of overflowing.
export function nextDue(day: string, every: string): string {
  if (every === "week") return addDays(day, 7);
  const [y, m, d] = day.split("-").map(Number);
  const [ty, tm] = every === "year" ? [y + 1, m - 1] : [y, m]; // target year and 0-based month
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ty, tm, Math.min(d, last), 12)).toISOString().slice(0, 10);
}
