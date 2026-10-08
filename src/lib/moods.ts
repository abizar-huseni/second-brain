// Mood and energy are stored 1-10; the pickers use 5 faces that save 2, 4, 6, 8 or 10.
export type Face = { value: number; emoji: string; label: string };

export const MOOD: Face[] = [
  { value: 2, emoji: "😫", label: "Awful" },
  { value: 4, emoji: "😕", label: "Low" },
  { value: 6, emoji: "😐", label: "Okay" },
  { value: 8, emoji: "🙂", label: "Good" },
  { value: 10, emoji: "🤩", label: "Great" },
];

export const ENERGY: Face[] = [
  { value: 2, emoji: "🪫", label: "Drained" },
  { value: 4, emoji: "🥱", label: "Tired" },
  { value: 6, emoji: "😌", label: "Steady" },
  { value: 8, emoji: "⚡", label: "Charged" },
  { value: 10, emoji: "🔥", label: "On fire" },
];

export function faceFor(scale: Face[], value: number | null | undefined): Face | null {
  if (value == null) return null;
  return scale[Math.min(4, Math.max(0, Math.ceil(value / 2) - 1))];
}

// Bar colour for a 1-10 score.
export const moodColor = (v: number) => (v <= 4 ? "bg-rose-400" : v <= 6 ? "bg-amber-400" : "bg-emerald-500");
