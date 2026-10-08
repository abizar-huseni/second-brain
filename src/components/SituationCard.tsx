"use client";
// Your course, dissertation and visa dates. Filled with best guesses from what you've written; you just confirm.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { callApi } from "@/lib/api";
import { lday } from "@/lib/ldates";
import { buzz } from "@/lib/feel";
import { SITUATION_COLS, daysBetween, fmtDay, type Situation } from "@/lib/situation";

type Form = { course_end: string; dissertation_due: string; visa_expiry: string; grad_plan: string };
const EMPTY: Form = { course_end: "", dissertation_due: "", visa_expiry: "", grad_plan: "apply" };
const PLANS = [
  { v: "apply", label: "Apply" },
  { v: "unsure", label: "Not sure" },
  { v: "no", label: "No" },
];

// The dissertation is also a goal with a deadline, so plans and tomorrow's non-negotiables are built around it.
async function dissertationGoal(due: string) {
  const { data } = await supabase.from("goals").select("id").is("parent_id", null).ilike("title", "%dissertation%").limit(1);
  if (data?.[0]) await supabase.from("goals").update({ deadline: due }).eq("id", data[0].id);
  else await supabase.from("goals").insert({ title: "Hand in my dissertation", area: "growth", target: 100, unit: "%", deadline: due });
}

export default function SituationCard() {
  const [s, setS] = useState<Situation | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [editing, setEditing] = useState(false);
  const [guessing, setGuessing] = useState(false);
  const [why, setWhy] = useState("");
  const [msg, setMsg] = useState("");
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    supabase
      .from("profile")
      .select(SITUATION_COLS)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) return setMissing(true);
        const cur = data as unknown as Situation | null;
        setS(cur);
        setForm({ course_end: cur?.course_end ?? "", dissertation_due: cur?.dissertation_due ?? "", visa_expiry: cur?.visa_expiry ?? "", grad_plan: cur?.grad_plan ?? "apply" });
        if (!cur?.situation_confirmed_at) {
          setEditing(true);
          setGuessing(true);
          callApi<Form & { why: string }>("/api/situation/guess", {})
            .then((g) => {
              setForm((f) => ({
                course_end: f.course_end || g.course_end || "",
                dissertation_due: f.dissertation_due || g.dissertation_due || "",
                visa_expiry: f.visa_expiry || g.visa_expiry || "",
                grad_plan: cur?.grad_plan && cur.grad_plan !== "unsure" ? cur.grad_plan : g.grad_plan || "apply",
              }));
              setWhy(g.why || "");
            })
            .catch(() => {})
            .finally(() => setGuessing(false));
        }
      });
  }, []);

  async function confirm() {
    buzz();
    const row = {
      course_end: form.course_end || null,
      dissertation_due: form.dissertation_due || null,
      visa_expiry: form.visa_expiry || null,
      grad_plan: form.grad_plan,
      situation_confirmed_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("profile").upsert(row, { onConflict: "user_id" });
    if (error) return setMsg(error.message);
    if (row.dissertation_due) await dissertationGoal(row.dissertation_due);
    setS((x) => ({ ...(x ?? { visa_type: "student", term_work_limit: 20 }), ...row }) as Situation);
    setEditing(false);
    setMsg("Locked in. Daily checks start with the next heartbeat.");
    setTimeout(() => setMsg(""), 3500);
  }

  if (missing) return null;
  const today = lday();
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const left = (d: string | null | undefined) => (d ? daysBetween(today, d) : null);

  if (!editing && s) {
    const rows = [
      { icon: "📝", label: "Dissertation due", d: s.dissertation_due },
      { icon: "🎓", label: "Course ends", d: s.course_end },
      { icon: "🛂", label: "Student visa ends", d: s.visa_expiry },
    ].filter((r) => r.d);
    return (
      <div className="card space-y-2">
        <div className="flex items-center justify-between">
          <p className="label mb-0">🎓 Your situation</p>
          <button className="text-xs text-zinc-500" onClick={() => setEditing(true)}>
            Edit
          </button>
        </div>
        <ul className="space-y-1.5 text-sm">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center gap-2">
              <span>{r.icon}</span>
              <span className="flex-1">{r.label}</span>
              <span className="tabular-nums text-zinc-500">
                {fmtDay(r.d!)} · {left(r.d)! >= 0 ? `${left(r.d)}d` : "passed"}
              </span>
            </li>
          ))}
          <li className="flex items-center gap-2">
            <span>🛫</span>
            <span className="flex-1">Graduate visa</span>
            <span className="text-zinc-500">{PLANS.find((p) => p.v === s.grad_plan)?.label}</span>
          </li>
        </ul>
        {msg && <p className="celebrate text-sm text-emerald-600">{msg}</p>}
      </div>
    );
  }

  return (
    <div className="card space-y-3">
      <p className="label mb-0">🎓 Your situation</p>
      <p className="text-xs text-zinc-500">
        {guessing ? "Filling in what I can from your notes…" : "Best guesses from what you've written. Fix anything that's off, then confirm. Only you and your assistant see these."}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="label">Dissertation due</span>
          <input type="date" className="input" value={form.dissertation_due} onChange={set("dissertation_due")} />
        </label>
        <label className="space-y-1">
          <span className="label">Course ends</span>
          <input type="date" className="input" value={form.course_end} onChange={set("course_end")} />
        </label>
        <label className="col-span-2 space-y-1">
          <span className="label">Student visa ends (on your eVisa)</span>
          <input type="date" className="input" value={form.visa_expiry} onChange={set("visa_expiry")} />
        </label>
      </div>
      <div>
        <span className="label">Apply for the Graduate visa?</span>
        <div className="flex gap-2">
          {PLANS.map((p) => (
            <button key={p.v} onClick={() => setForm((f) => ({ ...f, grad_plan: p.v }))} className={`chip flex-1 justify-center py-2 ${form.grad_plan === p.v ? "accent-fill text-white" : ""}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      {why && <p className="text-xs text-zinc-500">{why}</p>}
      <button className="btn btn-accent w-full" onClick={confirm} disabled={guessing}>
        Confirm
      </button>
      {msg && <p className="text-sm text-amber-600">{msg}</p>}
    </div>
  );
}
