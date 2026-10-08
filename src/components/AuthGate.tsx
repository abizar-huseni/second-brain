"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { isConfigured, supabase } from "@/lib/supabase";
import Shell from "./Shell";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (!isConfigured) return;
    linkFromQr().then(() => supabase.auth.getSession().then(({ data }) => setSession(data.session)));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!isConfigured) {
    return (
      <Centered>
        <h1 className="text-xl font-semibold">Almost there</h1>
        <p className="text-sm text-zinc-500">
          Add your Supabase URL and anon key to <code>.env.local</code> (see the README), then restart.
        </p>
      </Centered>
    );
  }
  if (session === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="brain-mark animate-pulse text-5xl">🧠</span>
      </div>
    );
  }
  if (!session) return <Login />;

  return <Shell email={session.user.email ?? ""}>{children}</Shell>;
}

// Scanning "Link a device" on a signed-in device opens /pair#pair=<one-time code>. Sign in with it,
// then wipe it from the address bar. The session then stays on this device until you sign out.
async function linkFromQr() {
  const code = new URLSearchParams(location.hash.slice(1)).get("pair");
  if (!code) return;
  history.replaceState(null, "", location.pathname);
  const { data } = await supabase.auth.getSession();
  if (data.session) return;
  const { error } = await supabase.auth.verifyOtp({ token_hash: code, type: "magiclink" });
  if (error) alert(`That code didn't work (${error.message}). Make a new one on your other device.`);
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-3 px-4">{children}</div>;
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(mode: "in" | "up") {
    setBusy(true);
    setError("");
    const { error } =
      mode === "in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    if (error) setError(/database error|sign-ups are closed/i.test(error.message) ? "Sign-ups are closed: this Second Brain already has its owner." : error.message);
    else if (mode === "up") setError("Account created. Check your email to confirm, then sign in.");
    setBusy(false);
  }

  return (
    <Centered>
      <h1 className="text-2xl font-semibold">Second Brain</h1>
      <input className="input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button className="btn" disabled={busy} onClick={() => submit("in")}>Sign in</button>
      <button className="text-sm text-zinc-500" disabled={busy} onClick={() => submit("up")}>Create account</button>
      {error && <p className="text-sm text-amber-600">{error}</p>}
      <p className="pt-4 text-center text-xs text-zinc-500">Signed in on another device? Open Me → Link a device there and scan the code with this one. No password needed.</p>
    </Centered>
  );
}
