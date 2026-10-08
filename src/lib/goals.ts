import type { Goal } from "./types";

// How far one small step is, 0 to 1. A ticked step is done; otherwise its own progress bar counts.
export const stepShare = (s: Goal) => (s.done ? 1 : Number(s.target) > 0 ? Math.min(1, Math.max(0, Number(s.current) / Number(s.target))) : 0);

// A big goal's progress = its own number, or the average progress of its small steps if it has steps.
export function goalProgress(goal: Goal, steps: Goal[]): [number, number] {
  if (steps.length) return [Math.round(steps.reduce((t, s) => t + stepShare(s), 0) * 100) / 100, steps.length];
  return [Number(goal.current), Number(goal.target)];
}
