"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { api, syncConnection, type BankConnection, type BankAccount } from "@/lib/bankClient";

// Your bank sends you back here after you approve access.
export default function BankCallback() {
  const router = useRouter();
  const [status, setStatus] = useState("Connecting your bank…");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const expected = sessionStorage.getItem("bank_state");
      if (params.get("error") || !code) return setStatus(`Bank connection cancelled: ${params.get("error_description") ?? params.get("error") ?? "no code"}`);
      if (expected && params.get("state") !== expected) return setStatus("Security check failed (state mismatch). Try connecting again.");
      try {
        const s = await api<{ session_id: string; bank: string; valid_until: string; accounts: BankAccount[] }>("/api/bank/session", { code });
        const { data, error } = await supabase.from("bank_connections").insert(s).select().single();
        if (error) throw new Error(error.message);
        setStatus(`Connected ${s.bank}. Pulling the last 90 days…`);
        const added = await syncConnection(data as BankConnection);
        setStatus(`Done: ${added} transactions imported from ${s.bank}.`);
        setTimeout(() => router.replace("/money"), 1500);
      } catch (e) {
        setStatus((e as Error).message);
      }
    })();
  }, [router]);

  return <p className="py-10 text-center text-zinc-500">{status}</p>;
}
