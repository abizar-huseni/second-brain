"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Connections from "@/components/Connections";
import DevicesSetup from "@/components/DevicesSetup";
import LinkDevice from "@/components/LinkDevice";
import NotifyButton from "@/components/NotifyButton";
import AIStatus from "@/components/AIStatus";
import RulesCard from "@/components/RulesCard";
import SituationCard from "@/components/SituationCard";
import { DEFAULT_NAME } from "@/lib/useAssistant";

const PROMPT = `Study: course, university, what you're aiming for next
Work: part-time hours and where
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
    setSaved(error ? (error.message.includes("profile") ? "The database is still setting up. It finishes on the next deploy." : error.message) : "Saved. Your assistant reads this every time.");
    setTimeout(() => setSaved(""), 3500);
  }

  const initial = (email.trim()[0] ?? "Y").toUpperCase();

  return (
    <div className="stagger space-y-4">
      <div className="card flex items-center gap-4">
        <span className="accent-fill flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-2xl font-semibold text-white shadow-md shadow-[var(--accent-glow)]">{initial}</span>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold">Your Second Brain</p>
          <p className="truncate text-sm text-zinc-500">{email}</p>
        </div>
      </div>

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 text-xs">
        {[
          { href: "#link", icon: "📲", label: "Link a device" },
          { href: "#situation", icon: "🎓", label: "Dates" },
          { href: "#about", icon: "👤", label: "About me" },
          { href: "#rules", icon: "📏", label: "Rules" },
          { href: "#devices", icon: "🛰️", label: "Laptop + phone" },
          { href: "#connections", icon: "🔌", label: "Connections" },
        ].map((x) => (
          <a key={x.href} href={x.href} className="chip flex shrink-0 items-center gap-1.5 py-2">
            <span className="text-base leading-none">{x.icon}</span>
            {x.label}
          </a>
        ))}
      </div>

      <div id="link" className="card scroll-mt-20">
        <LinkDevice />
      </div>

      <p className="eyebrow">Your brain</p>
      <div id="situation" className="scroll-mt-20">
        <SituationCard />
      </div>
      <div id="about" className="card scroll-mt-20 space-y-2">
        <p className="label">👤 About me</p>
        <p className="text-xs text-zinc-500">Your assistant reads this before every brief, plan and insight. Rules and deadlines here (like visa work limits) are treated as hard limits.</p>
        <textarea className="input" rows={6} placeholder={PROMPT} value={about} onChange={(e) => setAbout(e.target.value)} />
        <div>
          <label className="label">Your assistant&apos;s name</label>
          <input className="input" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
        </div>
        <button className="btn btn-accent w-full" onClick={save}>
          Save
        </button>
        {saved && <p className="celebrate text-center text-sm text-emerald-600">{saved}</p>}
      </div>
      <div id="rules" className="scroll-mt-20">
        <RulesCard />
      </div>
      <AIStatus />

      <p className="eyebrow">Devices</p>
      <DevicesSetup />
      <div className="card">
        <NotifyButton />
      </div>

      <p className="eyebrow">Connections</p>
      <div id="connections" className="scroll-mt-20">
        <Connections />
      </div>

      <button className="w-full rounded-2xl py-3 text-sm text-zinc-500 transition active:scale-95" onClick={() => supabase.auth.signOut()}>
        Sign out of this device
      </button>
    </div>
  );
}
