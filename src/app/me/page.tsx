"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Connections from "@/components/Connections";
import NotifyButton from "@/components/NotifyButton";
import LaptopCard from "@/components/LaptopCard";
import AIStatus from "@/components/AIStatus";
import { DEFAULT_NAME } from "@/lib/useAssistant";

const PROMPT = `Situation: visa type, end date, how many hours you're allowed to work, key deadlines
Work + study: course, job, hours, what you're aiming for next
Money: income, rent, debts, what you're saving for
Health + training: goals, injuries, routine
How my coach should talk to me: e.g. push me hard, call out excuses`;

export default function MePage() {
  const [about, setAbout] = useState("");
  const [name, setName] = useState(DEFAULT_NAME);
  const [saved, setSaved] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
    supabase
      .from("profile")
      .select("about, assistant_name")
      .maybeSingle()
      .then(({ data }) => {
        setAbout(data?.about ?? "");
        if (data?.assistant_name) setName(data.assistant_name);
      });
  }, []);

  async function save() {
    const { error } = await supabase.from("profile").upsert({ about, assistant_name: name.trim() || DEFAULT_NAME, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    setSaved(error ? (error.message.includes("profile") ? "Run supabase/006_live.sql first." : error.message) : "Saved. Your assistant reads this every time.");
    setTimeout(() => setSaved(""), 3500);
  }

  return (
    <div className="stagger space-y-4">
      <h1 className="text-[1.7rem] font-semibold tracking-tight">Me</h1>
      <div className="card space-y-2">
        <p className="label">👤 About me</p>
        <p className="text-xs muted">Your assistant reads this before every brief, plan and insight. Rules and deadlines here (like visa work limits) are treated as hard limits.</p>
        <textarea className="input" rows={10} placeholder={PROMPT} value={about} onChange={(e) => setAbout(e.target.value)} />
        <div>
          <label className="label">Your assistant&apos;s name</label>
          <input className="input" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
        </div>
        <button className="btn w-full" onClick={save}>
          Save
        </button>
        {saved && <p className="celebrate text-center text-sm text-emerald-600">{saved}</p>}
      </div>

      <AIStatus />

      <LaptopCard />

      <div className="card">
        <NotifyButton />
      </div>

      <Connections />

      <div className="card flex items-center justify-between">
        <p className="truncate text-sm muted">{email}</p>
        <button className="chip" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </div>
    </div>
  );
}
