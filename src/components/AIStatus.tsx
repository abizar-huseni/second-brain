"use client";
// Shows which free AI providers are switched on. More than one means the assistant never stalls:
// when one is busy, the next answers.
import { useEffect, useState } from "react";
import { callApi } from "@/lib/api";
import { timeAgo } from "@/lib/time";

type Status = { providers: { name: string; models: number }[]; research: boolean; lastServedBy: string | null; lastOk: string | null; lastError: string | null };

const ADD = [
  { name: "NVIDIA", env: "NVIDIA_API_KEY", where: "build.nvidia.com", note: "free, 40 requests a minute" },
  { name: "Groq", env: "GROQ_API_KEY", where: "console.groq.com", note: "free, about 1,000 a day" },
];

export default function AIStatus() {
  const [s, setS] = useState<Status | null>(null);
  useEffect(() => {
    callApi<Status>("/api/ai/status").then(setS).catch(() => setS(null));
  }, []);
  if (!s) return null;
  const missing = ADD.filter((a) => !s.providers.some((p) => p.name === a.name));
  return (
    <div className="card space-y-2">
      <p className="label">🧠 Brain power</p>
      {s.providers.length ? (
        <div className="flex flex-wrap gap-2">
          {s.providers.map((p, i) => (
            <span key={p.name} className="chip !py-1 text-xs">
              <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${i === 0 ? "bg-emerald-400" : "bg-sky-400"}`} />
              {p.name}
              {p.models > 1 ? ` · ${p.models} models` : ""}
              {i > 0 ? " · backup" : ""}
            </span>
          ))}
          {s.research && <span className="chip !py-1 text-xs">🔎 web research</span>}
        </div>
      ) : (
        <p className="text-sm">No AI key yet. Add AI_API_KEY in Vercel (free from aistudio.google.com).</p>
      )}
      {s.lastError && <p className="text-xs text-amber-500">Last problem: {s.lastError.slice(0, 140)}</p>}
      {s.lastOk && <p className="text-xs text-zinc-500 dark:text-zinc-400">Last thought on its own {timeAgo(s.lastOk)}.</p>}
      {missing.length > 0 && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Never get &quot;busy&quot; errors: add a free backup in Vercel →{" "}
          {missing.map((m, i) => (
            <span key={m.name}>
              {i > 0 && " or "}
              <b>{m.env}</b> ({m.where}, {m.note})
            </span>
          ))}
          . Keys go in Vercel only, never in chat.
        </p>
      )}
    </div>
  );
}
