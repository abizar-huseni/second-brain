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

// A night check-in done after midnight (before 4am) still belongs to the day before.
export function checkinDay(kind: "morning" | "night", d: Date = new Date()): string {
  if (kind === "night" && d.getHours() < 4) {
    const prev = new Date(d);
    prev.setDate(prev.getDate() - 1);
    return toDay(prev);
  }
  return toDay(d);
}

// Good habit: consecutive days done, counting back from today (or yesterday if today isn't ticked yet).
// Bad habit: consecutive clean days since the last slip, never further back than the day it was added.
export function streak(days: Set<string>, kind: "good" | "bad", createdAt?: string): number {
  let count = 0;
  if (kind === "good") {
    let i = days.has(toDay()) ? 0 : 1;
    while (days.has(daysAgo(i))) {
      count++;
      i++;
    }
  } else {
    const start = createdAt ? toDay(new Date(createdAt)) : daysAgo(364);
    while (count < 365 && daysAgo(count) >= start && !days.has(daysAgo(count))) count++;
  }
  return count;
}
