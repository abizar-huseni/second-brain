export type Area = "growth" | "fitness" | "mind" | "money" | "work";
export const AREAS: Area[] = ["growth", "fitness", "mind", "money", "work"];

export type Goal = {
  id: string;
  parent_id: string | null;
  title: string;
  area: Area;
  target: number;
  current: number;
  unit: string;
  deadline: string | null;
  done: boolean;
};

export type Habit = {
  id: string;
  name: string;
  kind: "good" | "bad";
  archived: boolean;
};

export type HabitLog = { habit_id: string; day: string };

export type Checkin = {
  id?: string;
  day: string;
  kind: "morning" | "night";
  mood: number | null;
  energy: number | null;
  priorities: string | null;
  wins: string | null;
  journal: string | null;
  hours_worked: number | null;
};
