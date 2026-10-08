"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { extractTags } from "@/lib/notes";
import MindMap from "@/components/MindMap";
import KeepImport from "@/components/KeepImport";
import { NOTE_KIND, type Note } from "@/lib/types";
import { callApi } from "@/lib/api";
import { useSubTabs } from "@/lib/subtabs";

const VIEWS = [
  { key: "list", label: "Thoughts" },
  { key: "map", label: "Mind map" },
] as const;

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [body, setBody] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "map">("list");
  useSubTabs(VIEWS, view, setView);
  const [query, setQuery] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("notes").select("*").order("pinned", { ascending: false }).order("created_at", { ascending: false });
    setNotes(data ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    if (busy.current || !body.trim()) return;
    busy.current = true;
    setSaving(true);
    const { data, error } = await supabase.from("notes").insert({ body: body.trim(), tags: extractTags(body) }).select("id").single();
    busy.current = false;
    setSaving(false);
    // Keep the text if it didn't save.
    if (error) return setMsg(error.message);
    setMsg("");
    setBody("");
    load();
    // The assistant files it in the background (rule, fact, idea...), then we refresh.
    if (data) callApi("/api/remember", { id: data.id }).then(load).catch(() => {});
  }

  async function togglePin(n: Note) {
    await supabase.from("notes").update({ pinned: !n.pinned }).eq("id", n.id);
    load();
  }

  async function remove(n: Note) {
    if (!confirm("Delete this note?")) return;
    await supabase.from("notes").delete().eq("id", n.id);
    load();
  }

  const shown = notes.filter((n) => {
    const inTag = !tag || (tag === "inbox" ? n.tags.length === 0 : n.tags.includes(tag));
    return inTag && (!query || n.body.toLowerCase().includes(query.toLowerCase()));
  });

  return (
    <div className="space-y-4">
      <div className="card space-y-2">
        <textarea
          className="input"
          rows={3}
          placeholder="Dump a thought. Your brain files it (rule, fact, idea, worry...) and brings it back when it matters."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && add()}
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-500">{extractTags(body).map((t) => `#${t}`).join(" ")}</span>
          <button className="btn btn-accent" disabled={saving} onClick={add}>Save</button>
        </div>
        {msg && <p className="notice">{msg}</p>}
      </div>


      {view === "map" && (
        <div className="card">
          <MindMap
            notes={notes}
            selected={tag}
            onSelect={setTag}
            onNote={(id) => {
              const el = document.getElementById(`note-${id}`);
              el?.scrollIntoView({ behavior: "smooth", block: "center" });
              el?.animate([{ boxShadow: "0 0 0 2px var(--accent)" }, { boxShadow: "0 0 0 2px transparent" }], { duration: 1600, delay: 300 });
            }}
          />
        </div>
      )}

      <div className="flex items-center gap-2">
        <input className="input" placeholder="Search notes" value={query} onChange={(e) => setQuery(e.target.value)} />
        {tag && (
          <button onClick={() => setTag(null)} className="shrink-0 rounded-full bg-emerald-500 px-3 py-1 text-xs text-white">
            #{tag} ✕
          </button>
        )}
      </div>

      <ul className="space-y-2">
        {shown.map((n) => (
          <li key={n.id} id={`note-${n.id}`} className="card scroll-mt-20">
            {(n.title || (n.kind && NOTE_KIND[n.kind])) && (
              <p className="mb-1 flex items-center gap-2 text-xs">
                {n.kind && NOTE_KIND[n.kind] && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-violet-800 dark:bg-violet-500/20 dark:text-violet-300">{NOTE_KIND[n.kind]}</span>}
                {n.title && <span className="font-medium">{n.title}</span>}
              </p>
            )}
            <p className="whitespace-pre-line text-sm">{n.body}</p>
            <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
              {n.tags.map((t) => (
                <button key={t} onClick={() => setTag(t)} className="chip px-2.5 py-0.5 text-xs">#{t}</button>
              ))}
              <span className="ml-auto">{new Date(n.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
              <button onClick={() => togglePin(n)} aria-label={n.pinned ? "Unpin note" : "Pin note"} aria-pressed={n.pinned}>
                {n.pinned ? "★" : "☆"}
              </button>
              <button onClick={() => remove(n)} aria-label="Delete note">✕</button>
            </div>
          </li>
        ))}
        {!shown.length && <p className="text-center text-sm text-zinc-500">No notes here yet.</p>}
      </ul>

      <div id="keep" className="scroll-mt-28">
        <KeepImport onDone={load} />
      </div>
    </div>
  );
}
