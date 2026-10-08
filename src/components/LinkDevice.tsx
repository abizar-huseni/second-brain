"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { callApi, errorText } from "@/lib/api";

// Sign another phone or laptop in without a password: scan the code with its camera.
export default function LinkDevice() {
  const [qr, setQr] = useState<{ img: string; link: string; until: number } | null>(null);
  const [left, setLeft] = useState(0);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!qr) return;
    const tick = () => {
      const s = Math.round((qr.until - Date.now()) / 1000);
      if (s <= 0) setQr(null);
      setLeft(s);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [qr]);

  async function make() {
    setBusy(true);
    setMsg("");
    try {
      const { code, expires_at } = await callApi<{ code: string; expires_at: number }>("/api/auth/pair");
      const link = `${location.origin}/pair#pair=${encodeURIComponent(code)}`;
      const img = await QRCode.toDataURL(link, { margin: 1, width: 240 });
      setQr({ img, link, until: expires_at });
    } catch (e) {
      setMsg(errorText(e));
    }
    setBusy(false);
  }

  return (
    <div className="space-y-2">
      <p className="label">📲 Link a device</p>
      <p className="text-sm text-zinc-500">Sign in on your phone or laptop without typing a password. It stays signed in until you sign out.</p>
      {qr ? (
        <div className="space-y-2 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr.img} alt="Sign-in code" className="mx-auto rounded-xl bg-white p-2" width={240} height={240} />
          <p className="text-sm">Point the other device&apos;s camera at this. Works once, for {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}.</p>
          <div className="flex justify-center gap-2">
            <button className="chip" onClick={() => navigator.clipboard.writeText(qr.link).then(() => setMsg("Link copied. Open it on the other device."))}>
              Copy link instead
            </button>
            <button className="chip" onClick={() => setQr(null)}>
              Hide
            </button>
          </div>
        </div>
      ) : (
        <button className="btn w-full" disabled={busy} onClick={make}>
          {busy ? "Making a code…" : "Show sign-in code"}
        </button>
      )}
      {msg && <p className="text-sm text-zinc-500">{msg}</p>}
    </div>
  );
}
