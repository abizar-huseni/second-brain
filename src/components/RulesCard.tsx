"use client";
// The rules and facts the assistant follows every time, so you can see them and delete any that are wrong.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { missingSource, ownNote } from "@/lib/notes";
import { useAssistantName } from "@/lib/useAssistant";
import { buzz } from "@/lib/feel";

type Row = { id: string; body: string; title: string | null; kind: string; tags: string[] | null; source?: string | null };

export default function RulesCard() {
  const name = useAssistantName();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const load = useCallback(async () => {
    const q = (cols: string) => supabase.from("notes").select(cols).in("kind", ["rule", "fact"]).order("created_at", { ascending: false }).limit(100);
    let res = await q("id, body, title, kind, tags, source");
    if (missingSource(res.error)) res = await q("id, body, title, kind, tags");
    setRows((res.data ?? []) as unknown as Row[]);
  }, []);

  useEffect(() => {
    load();
    return () => clearTimeout(timer.current);
  }, [load]);

  // First tap asks, second tap deletes.
  async function remove(id: string) {
    if (confirm !== id) {
      setConfirm(id);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setConfirm(""), 3000);
      return;
    }
    setConfirm("");
    buzz();
    const { error: e } = await supabase.from("notes").delete().eq("id", id);
    if (e) return setError(e.message);
    setError("");
    setRows((r) => (r ?? []).filter((x) => x.id !== id));
  }

  if (!rows) return null;

  return (
    <div className="card space-y-2">
      <p className="label">📏 What {name} always follows</p>
      <p className="text-xs text-zinc-500">Rules and facts from your own thoughts go into every brief and plan. Shared posts and copied text never do.</p>
      {!rows.length && <p className="text-sm text-zinc-500">Nothing yet. Drop a thought like &ldquo;always go for free options&rdquo; and it shows up here.</p>}
      <ul className="space-y-1.5">
        {rows.map((r) => {
          const mine = ownNote(r);
          return (
            <li key={r.id} className={`flex items-start gap-2 rounded-xl px-3 py-2 ${mine ? "bg-black/[0.03] dark:bg-white/[0.04]" : "opacity-60"}`}>
              <span className="mt-0.5 text-sm">{r.kind === "rule" ? "📏" : "📌"}</span>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm">{r.title || r.body}</p>
                {!mine && <p className="text-[11px] text-zinc-500">Saved from elsewhere, so not followed</p>}
              </div>
              <button
                onClick={() => remove(r.id)}
                aria-label={confirm === r.id ? "Tap again to delete" : "Delete"}
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs transition active:scale-95 ${confirm === r.id ? "bg-rose-500 text-white" : "text-zinc-400"}`}
              >
                {confirm === r.id ? "Delete?" : "✕"}
              </button>
            </li>
          );
        })}
      </ul>
      {error && <p className="text-sm text-amber-600">{error}</p>}
    </div>
  );
}
