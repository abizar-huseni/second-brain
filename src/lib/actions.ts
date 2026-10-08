"use client";
// Carries out a suggestion from the assistant when you tap its button.
import { supabase } from "./supabase";
import { extractTags, missingSource } from "./notes";
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
            : await insertAiNote(a.body);
  if (res.error) throw new Error(res.error.message);
}

// Notes the assistant suggests are marked as AI-written, so they can never become standing rules.
async function insertAiNote(body: string) {
  const row = { body, tags: [...new Set(["brain", ...extractTags(body)])] };
  const res = await supabase.from("notes").insert({ ...row, source: "ai" });
  return missingSource(res.error) ? supabase.from("notes").insert(row) : res;
}
