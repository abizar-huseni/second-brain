"use client";

// Opened by scanning the "Link a device" QR code. AuthGate signs this device in from the code
// in the address bar before anything else renders; this page just says so and moves on.
import { useEffect } from "react";

export default function PairPage() {
  useEffect(() => {
    const t = setTimeout(() => location.replace("/"), 1200);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="celebrate py-24 text-center">
      <p className="float text-6xl">✅</p>
      <p className="mt-4 text-xl font-semibold">This device is linked</p>
      <p className="text-sm text-zinc-500">Taking you home…</p>
    </div>
  );
}
