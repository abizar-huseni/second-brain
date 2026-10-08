import type { Goal } from "./types";

// A big goal's progress = its own number, or the share of small steps done if it has steps.
export function goalProgress(goal: Goal, steps: Goal[]): [number, number] {
  if (steps.length) return [steps.filter((s) => s.done).length, steps.length];
  return [Number(goal.current), Number(goal.target)];
}
