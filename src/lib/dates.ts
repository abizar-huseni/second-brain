// Dates are stored as local YYYY-MM-DD strings so "today" matches your clock, not UTC.
export function toDay(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDay(d);
}

// Good habit: consecutive days done, counting back from today (or yesterday if today isn't ticked yet).
// Bad habit: consecutive clean days since the last slip.
export function streak(days: Set<string>, kind: "good" | "bad"): number {
  let count = 0;
  if (kind === "good") {
    let i = days.has(toDay()) ? 0 : 1;
    while (days.has(daysAgo(i))) {
      count++;
      i++;
    }
  } else {
    while (count < 365 && !days.has(daysAgo(count))) count++;
  }
  return count;
}
