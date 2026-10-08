"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Connections from "@/components/Connections";

const PROMPT = `Situation: visa type, end date, how many hours you're allowed to work, key deadlines
Work + study: course, job, hours, what you're aiming for next
Money: income, rent, debts, what you're saving for
Health + training: goals, injuries, routine
How my coach should talk to me: e.g. push me hard, call out excuses`;

export default function MePage() {
  const [about, setAbout] = useState("");
  const [saved, setSaved] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
    supabase
      .from("profile")
      .select("about")
      .maybeSingle()
      .then(({ data }) => setAbout(data?.about ?? ""));
  }, []);

  async function save() {
    const { error } = await supabase.from("profile").upsert({ about, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    setSaved(error ? (error.message.includes("profile") ? "Run supabase/006_live.sql first." : error.message) : "Saved. Your coach reads this every time.");
    setTimeout(() => setSaved(""), 3500);
  }

  return (
    <div className="stagger space-y-4">
      <div className="card space-y-2">
        <p className="label">👤 About me</p>
        <p className="text-xs text-zinc-500">Your coach reads this before every brief. Rules and deadlines here (like visa work limits) are treated as hard limits.</p>
        <textarea className="input" rows={10} placeholder={PROMPT} value={about} onChange={(e) => setAbout(e.target.value)} />
        <button className="btn w-full" onClick={save}>
          Save
        </button>
        {saved && <p className="celebrate text-center text-sm text-emerald-600">{saved}</p>}
      </div>

      <Connections />

      <div className="card flex items-center justify-between">
        <p className="truncate text-sm text-zinc-500">{email}</p>
        <button className="chip" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </div>
    </div>
  );
}
