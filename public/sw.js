// Service worker: makes the app installable, keeps the app shell available offline,
// and shows your assistant's notifications. Data always comes fresh from Supabase.
const CACHE = "second-brain-v2";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin || new URL(req.url).pathname.startsWith("/api/")) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req))
  );
});

self.addEventListener("push", (e) => {
  let msg = { title: "Second Brain", body: "", url: "/" };
  try {
    msg = { ...msg, ...e.data.json() };
  } catch {}
  e.waitUntil(self.registration.showNotification(msg.title, { body: msg.body, icon: "/icon-192.png", badge: "/icon-192.png", data: { url: msg.url } }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = e.notification.data?.url ?? "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => "focus" in w);
      if (open) return open.navigate(url).then((w) => w?.focus());
      return self.clients.openWindow(url);
    })
  );
});
