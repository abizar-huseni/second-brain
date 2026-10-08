"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { isConfigured, supabase } from "@/lib/supabase";
import Nav from "./Nav";
import QuickAdd from "./QuickAdd";
import Orb from "./Orb";

// You sign in once per device. The session is kept on the device and refreshed quietly in the background,
// so the app opens straight to Today from then on.
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (!isConfigured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!isConfigured) {
    return (
      <Shell>
        <Centered>
          <h1 className="text-xl font-semibold">Almost there</h1>
          <p className="text-sm muted">
            Add your Supabase URL and anon key to <code>.env.local</code> (see the README), then restart.
          </p>
        </Centered>
      </Shell>
    );
  }
  if (session === undefined)
    return (
      <Shell>
        <Centered>
          <div className="mx-auto">
            <Orb size={88} />
          </div>
        </Centered>
      </Shell>
    );
  if (!session)
    return (
      <Shell>
        <Login />
      </Shell>
    );

  return (
    <Shell>
      <Nav />
      <main className="mx-auto max-w-3xl px-4 pb-36 pt-5 sm:pb-12 sm:pt-8">{children}</main>
      <QuickAdd />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="aurora" aria-hidden />
      {children}
    </>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-3 px-5">{children}</div>;
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setMsg(error.message === "Invalid login credentials" ? "That email and password don't match." : error.message);
    setBusy(false);
  }

  async function emailLink() {
    if (!email.trim()) return setMsg("Type your email first.");
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false, emailRedirectTo: location.origin } });
    setMsg(error ? error.message : "Check your email and tap the link. You'll stay signed in on this device.");
    setBusy(false);
  }

  return (
    <Centered>
      <div className="stagger space-y-5">
        <div className="flex flex-col items-center gap-3 text-center">
          <Orb size={96} />
          <h1 className="text-3xl font-semibold tracking-tight">Second Brain</h1>
          <p className="text-sm muted">Sign in once on this device. It remembers you.</p>
        </div>
        {/* A real form with autocomplete, so your phone offers to save and fill the password. */}
        <form onSubmit={signIn} className="space-y-3">
          <input className="input" type="email" name="email" autoComplete="username email" inputMode="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input className="input" type="password" name="password" autoComplete="current-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button className="btn-accent w-full !py-3" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <button type="button" className="w-full text-sm muted underline-offset-4 hover:underline" disabled={busy} onClick={emailLink}>
          Email me a sign-in link instead
        </button>
        {msg && <p className="rise text-center text-sm text-amber-500">{msg}</p>}
      </div>
    </Centered>
  );
}
