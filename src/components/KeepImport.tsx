"use client";
// Brings Google Keep notes into Thoughts from a Google Takeout export, and explains sharing new ones.
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { MAX_FILE_BYTES, isKeepJson, parseKeep, unzip, type KeepNote } from "@/lib/keep";

// Older notes are saved as already filed, so the assistant doesn't spend days sorting your whole history.
const FILE_RECENT_DAYS = 60;

export default function KeepImport({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function importFiles(list: FileList | null) {
    if (!list?.length || busy) return;
    setBusy(true);
    setMsg("Reading your export…");
    try {
      const texts: string[] = [];
      for (const f of Array.from(list)) {
        if (/\.zip$/i.test(f.name)) texts.push(...(await unzip(f, isKeepJson)).map((x) => x.text));
        else if (/\.json$/i.test(f.name) && f.size <= MAX_FILE_BYTES) texts.push(await f.text());
      }
      const { data: auth } = await supabase.auth.getUser();
      const notes = texts.map((t) => parseKeep(t, auth.user?.email ?? "")).filter((n): n is KeepNote => !!n);
      if (!notes.length) throw new Error("No Keep notes found. Pick the Takeout .zip, or the .json files from its Keep folder.");

      const cutoff = Date.now() - FILE_RECENT_DAYS * 86400000;
      let added = 0;
      for (let i = 0; i < notes.length; i += 200) {
        const rows = notes.slice(i, i + 200).map((n) => ({ ...n, processed: Date.parse(n.created_at) < cutoff }));
        // Same note again = skipped, so importing a newer export only adds what's new.
        const { data, error } = await supabase.from("notes").upsert(rows, { onConflict: "user_id,external_id", ignoreDuplicates: true }).select("id");
        if (error) throw new Error(/source|external_id/.test(error.message) ? "Your database is still getting an update. Try again after the next deploy." : error.message);
        added += data?.length ?? 0;
      }
      const skipped = notes.length - added;
      setMsg(`Brought in ${added} note${added === 1 ? "" : "s"}${skipped ? ` (${skipped} already here)` : ""}.`);
      onDone();
    } catch (e) {
      setMsg((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <div className="card space-y-2">
      <button className="flex w-full items-center justify-between text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="label mb-0">📒 Google Keep</span>
        <span className="text-xs text-zinc-500">{open ? "Hide" : "Bring your notes in"}</span>
      </button>
      {open && (
        <div className="space-y-3 text-sm">
          <div>
            <p className="font-medium">New notes</p>
            <p className="text-zinc-500">In Keep, open a note, tap ⋮ then Send, and pick Second Brain. You check it and tap Save.</p>
          </div>
          <div className="space-y-2">
            <p className="font-medium">Everything you already have</p>
            <ol className="list-decimal space-y-0.5 pl-5 text-zinc-500">
              <li>
                Go to{" "}
                <a className="underline" href="https://takeout.google.com/" target="_blank" rel="noreferrer">
                  takeout.google.com
                </a>
                , tap Deselect all, tick only Keep.
              </li>
              <li>Export once, then download the .zip when Google emails you.</li>
              <li>Pick it here. It&apos;s read on this device; only the notes are saved.</li>
            </ol>
            <label className={`btn btn-accent block w-full cursor-pointer text-center ${busy ? "opacity-60" : ""}`}>
              {busy ? "Importing…" : "Choose Keep export"}
              <input type="file" accept=".zip,.json,application/zip,application/json" multiple className="hidden" disabled={busy} onChange={(e) => { importFiles(e.target.files); e.target.value = ""; }} />
            </label>
          </div>
        </div>
      )}
      {msg && <p className="notice">{msg}</p>}
    </div>
  );
}
