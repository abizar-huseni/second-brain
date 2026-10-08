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

export type Note = {
  id: string;
  body: string;
  tags: string[];
  pinned: boolean;
  created_at: string;
  kind?: string | null; // filed by the assistant: rule | fact | idea | goal | worry | reminder | other | archived
  title?: string | null;
  remind_on?: string | null;
};

export const NOTE_KIND: Record<string, string> = { rule: "📏 rule", fact: "📌 fact", idea: "💡 idea", goal: "🎯 goal", worry: "😟 worry", reminder: "⏰ reminder", archived: "🍃 let go" };

export type Transaction = {
  id: string;
  day: string;
  kind: "income" | "expense";
  amount: number;
  category: string;
  note: string | null;
  description?: string | null;
  account?: string | null;
  source?: string;
};

export type Payslip = {
  id: string;
  pay_date: string;
  employer: string | null;
  hours: number | null;
  gross: number;
  tax: number;
  ni: number;
  pension: number;
  student_loan: number;
  net: number;
};

export type Debt = {
  id: string;
  name: string;
  start_balance: number;
  balance: number;
  apr: number | null;
  min_payment: number | null;
};
