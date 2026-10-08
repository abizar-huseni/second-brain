// A copy of your last-loaded data kept on this device, so a page can paint instantly while fresh data loads.
// Everything here is wiped on sign-out (see wipeLocalData).
const PREFIX = "sb:cache:";
// Personal data other parts of the app keep on the device.
const EXTRA_KEYS = ["bank_accounts", "bank_last_sync"];

export function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeCache(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the app works the same, just without the instant paint.
  }
}

export function wipeLocalData() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX) || EXTRA_KEYS.includes(k)) localStorage.removeItem(k);
    sessionStorage.clear();
  } catch {}
  // The service worker keeps copies of pages you opened; drop them too.
  if ("caches" in window) caches.keys().then((ks) => ks.forEach((k) => caches.delete(k))).catch(() => {});
}
