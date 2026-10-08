import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Second Brain",
    short_name: "Brain",
    description: "Your life in one place, with a brain that thinks ahead for you.",
    start_url: "/",
    display: "standalone",
    background_color: "#18181b",
    theme_color: "#18181b",
    // Long-press the app icon for these.
    shortcuts: [
      { name: "Dump a thought", short_name: "Thought", url: "/?add=thought", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "I'm craving", short_name: "Craving", url: "/quit?sos=1", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Add a task", short_name: "Task", url: "/?add=task", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Log spending", short_name: "Spent", url: "/?add=spent", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
    // Share text or links from any app straight into your brain.
    share_target: { action: "/share", method: "GET", params: { title: "title", text: "text", url: "url" } },
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
