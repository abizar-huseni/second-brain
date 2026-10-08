"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { extractTags } from "@/lib/notes";
import { callApi } from "@/lib/api";

// Android "Share → Second Brain" lands here. Nothing is saved until you tap Save, so a link alone can't plant a thought.
export default function SharePage() {
  const [state, setState] = useState<"loading" | "ready" | "saving" | "saved" | "empty" | "error">("loading");
  const [body, setBody] = useState("");
  const [reply, setReply] = useState("");
  const busy = useRef(false);

  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const text = [p.get("title"), p.get("text"), p.get("url")].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join("\n");
    setBody(text);
    setState(text.trim() ? "ready" : "empty");
  }, []);

  async function save() {
    // One tap, one note.
    if (busy.current) return;
    busy.current = true;
    setState("saving");
    const { data, error } = await supabase
      .from("notes")
      .insert({ body: body.trim(), tags: [...new Set(["shared", ...extractTags(body)])] })
      .select("id")
      .single();
    if (error || !data) {
      busy.current = false;
      return setState("error");
    }
    setState("saved");
    callApi<{ filed: { reply: string } | null }>("/api/remember", { id: data.id })
      .then(({ filed }) => filed?.reply && setReply(filed.reply))
      .catch(() => {});
  }

  if (state === "loading") return null;

  return (
    <div className="rise card space-y-3 text-center">
      <p className="text-5xl">{state === "saved" || state === "ready" ? "💭" : state === "saving" ? "⏳" : "🤷"}</p>
      <p className="text-lg font-semibold">
        {state === "saved" ? "Caught it." : state === "ready" ? "Save this to your brain?" : state === "saving" ? "Saving…" : state === "empty" ? "Nothing was shared." : "Couldn't save that."}
      </p>
      {body && <p className="whitespace-pre-line rounded-xl bg-zinc-50 p-3 text-left text-sm dark:bg-zinc-800">{body}</p>}
      {reply && <p className="celebrate text-sm text-emerald-700 dark:text-emerald-400">🧠 {reply}</p>}
      <div className="flex flex-wrap justify-center gap-2">
        {(state === "ready" || state === "saving" || state === "error") && (
          <button className="btn btn-accent" disabled={state === "saving"} onClick={save}>
            Save thought
          </button>
        )}
        <Link href="/" className="btn inline-block">
          Back to today
        </Link>
      </div>
    </div>
  );
}
