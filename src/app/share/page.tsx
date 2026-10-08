"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { extractTags } from "@/lib/notes";
import { callApi } from "@/lib/api";

// Android "Share → Second Brain" lands here: the shared text or link is saved as a thought.
export default function SharePage() {
  const [state, setState] = useState<"saving" | "saved" | "empty" | "error">("saving");
  const [body, setBody] = useState("");
  const [reply, setReply] = useState("");
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    const p = new URLSearchParams(location.search);
    const text = [p.get("title"), p.get("text"), p.get("url")].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join("\n");
    setBody(text);
    if (!text.trim()) return setState("empty");
    supabase
      .from("notes")
      .insert({ body: text.trim(), tags: extractTags(text) })
      .select("id")
      .single()
      .then(({ data, error }) => {
        if (error || !data) return setState("error");
        setState("saved");
        callApi<{ filed: { reply: string } | null }>("/api/remember", { id: data.id })
          .then(({ filed }) => filed?.reply && setReply(filed.reply))
          .catch(() => {});
      });
  }, []);

  return (
    <div className="rise card space-y-3 text-center">
      <p className="text-5xl">{state === "saved" ? "💭" : state === "saving" ? "⏳" : "🤷"}</p>
      <p className="text-lg font-semibold">{state === "saved" ? "Caught it." : state === "saving" ? "Saving…" : state === "empty" ? "Nothing was shared." : "Couldn't save that."}</p>
      {body && <p className="whitespace-pre-line rounded-xl bg-zinc-50 p-3 text-left text-sm dark:bg-zinc-800">{body}</p>}
      {reply && <p className="celebrate text-sm text-emerald-700 dark:text-emerald-400">🧠 {reply}</p>}
      <Link href="/" className="btn inline-block">
        Back to today
      </Link>
    </div>
  );
}
