import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Second Brain",
    short_name: "Brain",
    description: "Goals, habits and daily check-ins in one place.",
    start_url: "/",
    display: "standalone",
    background_color: "#18181b",
    theme_color: "#18181b",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
