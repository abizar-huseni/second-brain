"use client";
// Carries out a suggestion from the assistant when you tap its button.
import { supabase } from "./supabase";
import { extractTags } from "./notes";
import type { InsightAction } from "./think";

export const ACTION_LABEL: Record<InsightAction["type"], string> = {
  goal: "＋ Add goal",
  task: "＋ Add task",
  bill: "＋ Track expense",
  habit: "＋ Add habit",
  note: "＋ Save note",
};

export async function applyAction(a: InsightAction) {
  const res =
    a.type === "goal"
      ? await supabase.from("goals").insert({ title: a.title, area: a.area ?? "growth", target: a.target ?? 100, unit: a.unit ?? "%", deadline: a.deadline ?? null })
      : a.type === "task"
        ? await supabase.from("tasks").insert({ title: a.title, day: a.day ?? null, must: a.must ?? false, source: "ai" })
        : a.type === "bill"
          ? await supabase.from("bills").insert({ name: a.name, amount: a.amount, next_due: a.next_due, every: a.every ?? "once" })
          : a.type === "habit"
            ? await supabase.from("habits").insert({ name: a.name, kind: a.kind ?? "good" })
            : await supabase.from("notes").insert({ body: a.body, tags: [...new Set(["brain", ...extractTags(a.body)])] });
  if (res.error) throw new Error(res.error.message);
}
