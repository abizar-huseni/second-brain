// Everything the device agent knows how to do. The agent (public/agent/second-brain-agent.mjs) has the
// real code for each one and checks the params again before running, so this list only drives the app:
// the plain-English line you approve, the AI's choices, and which device can do what.

export type DeviceKind = "windows" | "android" | "other";
export type Risk = "low" | "medium" | "high";
type Param = { type: "number" | "string" | "boolean"; min?: number; max?: number; options?: string[]; optional?: boolean; hint?: string };

export type CatalogItem = {
  label: string;
  icon: string;
  on: DeviceKind[];
  risk: Risk;
  params: Record<string, Param>;
  // The exact thing that will happen, built only from the params, so what you see is what you sign.
  says: (p: Record<string, unknown>) => string;
};

const mins = (m: unknown) => (Number(m) === 0 ? "never" : `after ${m} min`);
const whenText = (w: unknown) => (w === "plugged" ? "when plugged in" : w === "battery" ? "on battery" : "plugged in and on battery");
const ALL: DeviceKind[] = ["windows", "android", "other"];

export const CATALOG: Record<string, CatalogItem> = {
  screen_timeout: {
    label: "Screen timeout",
    icon: "🖥️",
    on: ["windows"],
    risk: "low",
    params: { minutes: { type: "number", min: 0, max: 300, hint: "0 = never" }, when: { type: "string", options: ["plugged", "battery", "both"], optional: true } },
    says: (p) => `Turn the screen off ${mins(p.minutes)} of no use (${whenText(p.when)}).`,
  },
  sleep_timeout: {
    label: "Sleep timeout",
    icon: "😴",
    on: ["windows"],
    risk: "low",
    params: { minutes: { type: "number", min: 0, max: 600, hint: "0 = never" }, when: { type: "string", options: ["plugged", "battery", "both"], optional: true } },
    says: (p) => `Put the laptop to sleep ${mins(p.minutes)} of no use (${whenText(p.when)}).`,
  },
  keep_awake: {
    label: "Keep awake",
    icon: "☕",
    on: ["windows"],
    risk: "low",
    params: { hours: { type: "number", min: 0.25, max: 12 } },
    says: (p) => `Keep the screen on and stop sleep for the next ${p.hours} hours, then go back to normal.`,
  },
  lock: { label: "Lock", icon: "🔒", on: ["windows"], risk: "low", params: {}, says: () => "Lock the laptop now." },
  sleep_now: { label: "Sleep", icon: "🌙", on: ["windows"], risk: "medium", params: {}, says: () => "Put the laptop to sleep now. Unsaved work stays open." },
  shutdown: {
    label: "Shut down",
    icon: "⏻",
    on: ["windows"],
    risk: "medium",
    params: { in_minutes: { type: "number", min: 1, max: 240 } },
    says: (p) => `Shut the laptop down in ${p.in_minutes} min (save your work; "cancel shutdown" stops it).`,
  },
  restart: { label: "Restart", icon: "🔄", on: ["windows"], risk: "medium", params: {}, says: () => "Restart the laptop in 1 minute." },
  cancel_shutdown: { label: "Cancel shutdown", icon: "✋", on: ["windows"], risk: "low", params: {}, says: () => "Cancel a planned shutdown or restart." },
  volume: {
    label: "Volume",
    icon: "🔊",
    on: ["windows", "android"],
    risk: "low",
    params: { level: { type: "number", min: 0, max: 100, hint: "%" } },
    says: (p) => `Set the volume to ${p.level}%.`,
  },
  mute: { label: "Mute", icon: "🔇", on: ["windows"], risk: "low", params: {}, says: () => "Mute or unmute the sound." },
  dark_mode: {
    label: "Dark mode",
    icon: "🌗",
    on: ["windows"],
    risk: "low",
    params: { on: { type: "boolean" } },
    says: (p) => `Switch Windows to ${p.on ? "dark" : "light"} mode.`,
  },
  brightness: {
    label: "Brightness",
    icon: "🔆",
    on: ["windows", "android"],
    risk: "low",
    params: { level: { type: "number", min: 0, max: 100, hint: "%" } },
    says: (p) => `Set screen brightness to ${p.level}%.`,
  },
  open_url: {
    label: "Open a link",
    icon: "🔗",
    on: ALL,
    risk: "low",
    params: { url: { type: "string", hint: "https://..." } },
    says: (p) => `Open ${p.url} in the browser.`,
  },
  open_app: {
    label: "Open an app",
    icon: "🚀",
    on: ["windows"],
    risk: "low",
    params: { name: { type: "string", hint: "e.g. notepad, spotify, code" } },
    says: (p) => `Open ${p.name}.`,
  },
  close_app: {
    label: "Close an app",
    icon: "✖️",
    on: ["windows"],
    risk: "medium",
    params: { name: { type: "string", hint: "process name, e.g. discord" } },
    says: (p) => `Close every window of ${p.name} (unsaved work in it is lost).`,
  },
  focus_mode: {
    label: "Focus mode",
    icon: "🎯",
    on: ["windows"],
    risk: "medium",
    params: { apps: { type: "string", optional: true, hint: "comma-separated, default: discord, steam, epicgameslauncher, whatsapp" }, hours: { type: "number", min: 0.25, max: 8, optional: true } },
    says: (p) => `Close ${p.apps || "Discord, Steam, Epic Games and WhatsApp"}${p.hours ? ` and keep closing them for ${p.hours} hours` : ""}.`,
  },
  notify: {
    label: "Pop-up message",
    icon: "💬",
    on: ALL,
    risk: "low",
    params: { text: { type: "string" } },
    says: (p) => `Show a pop-up: "${p.text}"`,
  },
  speak: { label: "Say out loud", icon: "🗣️", on: ["windows", "android"], risk: "low", params: { text: { type: "string" } }, says: (p) => `Say out loud: "${p.text}"` },
  clean_temp: { label: "Clean temp files", icon: "🧹", on: ["windows"], risk: "low", params: {}, says: () => "Delete temporary files older than 3 days and tell you how much space came back." },
  empty_recycle_bin: { label: "Empty recycle bin", icon: "🗑️", on: ["windows"], risk: "medium", params: {}, says: () => "Empty the recycle bin for good." },
  status: { label: "Status check", icon: "🩺", on: ALL, risk: "low", params: {}, says: () => "Report battery, storage, memory and what's using the most of it." },
  find_files: {
    label: "Find files",
    icon: "🔎",
    on: ALL,
    risk: "low",
    params: { query: { type: "string" }, folder: { type: "string", options: ["documents", "desktop", "downloads", "home"], optional: true } },
    says: (p) => `List files named like "${p.query}" in ${p.folder ?? "home"} (names only, up to 50).`,
  },
  read_file: {
    label: "Read a file",
    icon: "📄",
    on: ALL,
    risk: "medium",
    params: { path: { type: "string" } },
    says: (p) => `Send the text of ${p.path} (first 20 KB) to your dashboard.`,
  },
  torch: { label: "Torch", icon: "🔦", on: ["android"], risk: "low", params: { on: { type: "boolean" } }, says: (p) => `Turn the torch ${p.on ? "on" : "off"}.` },
  find_phone: { label: "Find my phone", icon: "📍", on: ["android"], risk: "low", params: {}, says: () => "Turn the volume up, vibrate and say \"I'm here\" 5 times." },
  vibrate: { label: "Vibrate", icon: "📳", on: ["android"], risk: "low", params: {}, says: () => "Vibrate the phone." },
  clipboard_to_note: { label: "Save clipboard", icon: "📋", on: ["android", "windows"], risk: "medium", params: {}, says: () => "Save whatever is on the clipboard as a note." },
  vault_sync: {
    label: "Sync notes folder",
    icon: "🗂️",
    on: ALL,
    risk: "medium",
    params: { path: { type: "string" } },
    says: (p) => `Copy the markdown notes in ${p.path} into your Notes, and keep them in sync every 5 minutes.`,
  },
  vault_off: { label: "Stop notes sync", icon: "⏸️", on: ALL, risk: "low", params: {}, says: () => "Stop syncing your notes folder." },
  trust_key: {
    label: "Trust a new browser",
    icon: "🔑",
    on: ALL,
    risk: "high",
    params: { id: { type: "string" }, name: { type: "string" } },
    says: (p) => `Let "${p.name}" (key ${p.id}) approve actions on this device from now on.`,
  },
  run: {
    label: "Run a command",
    icon: "⌨️",
    on: ALL,
    risk: "high",
    params: { command: { type: "string" } },
    says: (p) => `Run this exact command: ${p.command}`,
  },
};

export const RISK_STYLE: Record<Risk, string> = {
  low: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
  high: "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300",
};

export function describe(action: string, params: Record<string, unknown>) {
  const item = CATALOG[action];
  return item ? item.says(params ?? {}) : `Unknown action "${action}". The agent will refuse it.`;
}

// Checks params against the catalogue. Returns cleaned params or an error.
export function checkParams(action: string, params: Record<string, unknown>): { ok: true; params: Record<string, unknown> } | { ok: false; error: string } {
  const item = CATALOG[action];
  if (!item) return { ok: false, error: `Unknown action ${action}` };
  const out: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(item.params)) {
    let v = params?.[name];
    if (v === undefined || v === null || v === "") {
      if (spec.optional) continue;
      return { ok: false, error: `Missing ${name}` };
    }
    if (spec.type === "number") {
      v = Number(v);
      if (!Number.isFinite(v as number) || (spec.min !== undefined && (v as number) < spec.min) || (spec.max !== undefined && (v as number) > spec.max)) return { ok: false, error: `${name} must be ${spec.min}-${spec.max}` };
    } else if (spec.type === "boolean") {
      v = v === true || v === "true" || v === "on";
    } else {
      v = String(v).slice(0, 2000);
      if (spec.options && !spec.options.includes(v as string)) return { ok: false, error: `${name} must be one of ${spec.options.join(", ")}` };
    }
    out[name] = v;
  }
  if (action === "open_url" && !/^https?:\/\//i.test(String(out.url))) return { ok: false, error: "Links must start with http:// or https://" };
  return { ok: true, params: out };
}

// Free fallback when no AI key is set: understands the common asks.
export function matchIntent(text: string, kind: DeviceKind): { action: string; params: Record<string, unknown>; title: string } | null {
  const t = text.toLowerCase();
  const num = Number(t.match(/(\d+(?:\.\d+)?)/)?.[1] ?? NaN);
  const has = (...w: string[]) => w.some((x) => t.includes(x));
  const pick = (action: string, params: Record<string, unknown>, title: string) => (CATALOG[action].on.includes(kind) ? { action, params, title } : null);
  if (has("black", "screen off", "screen timeout", "turns off", "goes dark", "dims")) return pick("screen_timeout", { minutes: Number.isFinite(num) ? num : has("never") ? 0 : 30, when: "both" }, "Stop the screen going black so fast");
  if (has("awake", "don't sleep", "dont sleep", "stay on")) return pick("keep_awake", { hours: Number.isFinite(num) ? num : 2 }, "Keep the laptop awake");
  if (has("find my phone", "where is my phone", "ring my phone")) return pick("find_phone", {}, "Find my phone");
  if (has("torch", "flashlight")) return pick("torch", { on: !has("off") }, `Torch ${has("off") ? "off" : "on"}`);
  if (has("lock")) return pick("lock", {}, "Lock the laptop");
  if (has("cancel shutdown")) return pick("cancel_shutdown", {}, "Cancel shutdown");
  if (has("shut down", "shutdown", "turn off")) return pick("shutdown", { in_minutes: Number.isFinite(num) ? num : 1 }, "Shut down");
  if (has("restart", "reboot")) return pick("restart", {}, "Restart");
  if (has("sleep")) return pick("sleep_now", {}, "Sleep now");
  if (has("mute")) return pick("mute", {}, "Mute");
  if (has("volume")) return pick("volume", { level: Number.isFinite(num) ? num : 50 }, "Set volume");
  if (has("brightness", "brighter", "dimmer")) return pick("brightness", { level: Number.isFinite(num) ? num : 60 }, "Set brightness");
  if (has("dark mode")) return pick("dark_mode", { on: true }, "Dark mode on");
  if (has("light mode")) return pick("dark_mode", { on: false }, "Light mode on");
  const close = t.match(/\b(?:close|kill) ([\w.+-]+)/)?.[1];
  if (close && !["everything", "all", "the", "my"].includes(close)) return pick("close_app", { name: close }, `Close ${close}`);
  if (has("focus", "distract")) return pick("focus_mode", { hours: Number.isFinite(num) ? num : 2 }, "Focus mode");
  if (has("clean", "space", "storage", "temp")) return pick("clean_temp", {}, "Clean temp files");
  if (has("recycle", "bin")) return pick("empty_recycle_bin", {}, "Empty recycle bin");
  if (has("battery", "status", "how is", "health check")) return pick("status", {}, "Status check");
  const url = text.match(/https?:\/\/\S+/)?.[0];
  if (url) return pick("open_url", { url }, "Open link");
  const find = t.match(/(?:find|where(?:'s| is)) (?:my |the )?(.+?)(?: file| files)?$/)?.[1];
  if (find) return pick("find_files", { query: find, folder: "home" }, `Find ${find}`);
  return null;
}
