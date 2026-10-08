"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ACTION_LABEL, applyAction } from "@/lib/actions";
import { callApi, errorText } from "@/lib/api";
import { useAssistantName } from "@/lib/useAssistant";
import { timeAgo } from "@/lib/time";
import type { Insight } from "@/lib/think";

const KIND: Record<string, { icon: string; tint: string }> = {
  deadline: { icon: "⏰", tint: "border-l-rose-500" },
  risk: { icon: "⚠️", tint: "border-l-amber-500" },
  money: { icon: "💷", tint: "border-l-emerald-500" },
  health: { icon: "💪", tint: "border-l-sky-500" },
  growth: { icon: "🌱", tint: "border-l-lime-500" },
  opportunity: { icon: "✨", tint: "border-l-violet-500" },
};

// What the assistant noticed on its own, with one-tap follow-through.
export default function InsightsCard() {
  const name = useAssistantName();
  const [items, setItems] = useState<Insight[] | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("insights").select("*").eq("status", "new").order("priority").order("created_at", { ascending: false }).limit(4);
    setItems(error ? [] : (data ?? []));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function thinkNow() {
    setBusy("think");
    setMsg("");
    try {
      const { insights } = await callApi<{ insights: Insight[] }>("/api/think");
      setMsg(insights.length ? "" : "Nothing new worth your attention right now.");
      await load();
    } catch (e) {
      setMsg(errorText(e));
    }
    setBusy("");
  }

  async function act(i: Insight, accept: boolean) {
    setBusy(i.id!);
    try {
      if (accept && i.action) await applyAction(i.action);
      await supabase.from("insights").update({ status: accept ? "done" : "dismissed" }).eq("id", i.id!);
      setItems((xs) => xs?.filter((x) => x.id !== i.id) ?? null);
    } catch (e) {
      setMsg(errorText(e));
    }
    setBusy("");
  }

  if (items === null) return <div className="skeleton h-28" />;

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <p className="label mb-0">💡 {name} noticed</p>
        <button onClick={thinkNow} disabled={busy === "think"} className="text-xs text-zinc-500 disabled:opacity-50">
          {busy === "think" ? "Thinking…" : "↻ Think now"}
        </button>
      </div>
      {busy === "think" && !items.length && <div className="skeleton h-16" />}
      {!items.length && busy !== "think" && (
        <p className="text-sm text-zinc-500">Nothing flagged. {name} thinks ahead every morning at 6am and tells you what you&apos;d miss.</p>
      )}
      <div className="stagger space-y-2">
        {items.map((i) => {
          const k = KIND[i.kind] ?? KIND.growth;
          return (
            <div key={i.id} className={`rounded-xl border-l-4 bg-zinc-50 p-3 dark:bg-zinc-800/60 ${k.tint}`}>
              <div className="flex gap-2">
                <span className="text-lg">{k.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {i.title}
                    {i.priority === 1 && <span className="ml-2 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">TODAY</span>}
                  </p>
                  <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-300">{i.body}</p>
                  {!!i.sources?.length && (
                    <p className="mt-1 flex flex-wrap gap-x-2 text-xs">
                      {i.sources.map((s, n) => {
                        const host = webHost(s.url);
                        return host ? (
                          <a key={n} href={s.url} target="_blank" rel="noreferrer noopener" className="truncate text-zinc-500 underline">
                            {host}
                          </a>
                        ) : null;
                      })}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    {i.action && (
                      <button disabled={busy === i.id} onClick={() => act(i, true)} className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white transition active:scale-95">
                        {ACTION_LABEL[i.action.type]}
                      </button>
                    )}
                    <button disabled={busy === i.id} onClick={() => act(i, !i.action)} className="rounded-lg border border-zinc-300 px-3 py-1 text-xs dark:border-zinc-700">
                      {i.action ? "Not now" : "Got it"}
                    </button>
                    <span className="ml-auto text-[10px] text-zinc-400">{timeAgo(i.created_at)}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {msg && <p className="text-sm text-zinc-500">{msg}</p>}
    </div>
  );
}

// Links come from web search, so only open real web pages (never javascript: or a malformed URL).
function webHost(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.hostname.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
}
