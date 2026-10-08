"use client";

// Opened by scanning the "Link a device" QR code. AuthGate signs this device in from the code
// in the address bar before anything else renders; this page just says so and moves on.
import { useEffect } from "react";

export default function PairPage() {
  useEffect(() => {
    const t = setTimeout(() => location.replace("/"), 1200);
    return () => clearTimeout(t);
  }, []);
  return <p className="py-20 text-center text-lg">✅ This device is linked. Taking you home…</p>;
}
