// London calendar helpers that work the same on the server (UTC) and in the browser.
export const TZ = "Europe/London";

export const lday = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86400000).toLocaleDateString("en-CA", { timeZone: TZ });

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
export function nextDue(day: string, every: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  if (every === "week") d.setUTCDate(d.getUTCDate() + 7);
  else if (every === "year") d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}
