import type { Metadata, Viewport } from "next";
import AuthGate from "@/components/AuthGate";
import "./globals.css";

export const metadata: Metadata = {
  title: "Second Brain",
  description: "Goals, habits and daily check-ins in one place.",
  appleWebApp: { capable: true, title: "Second Brain", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#18181b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
