// What the laptop agent ("Brain Link") is allowed to do. A fixed list on purpose:
// the assistant can only pick from these, you approve each one, and the laptop re-checks
// everything before acting. There is no "run any command" action.
export type ActionId =
  | "screen_timeout"
  | "sleep_timeout"
  | "open_url"
  | "notify"
  | "lock_screen"
  | "system_status"
  | "find_files"
  | "read_file"
  | "tidy_folder"
  | "undo_tidy";

type Params = Record<string, unknown>;
type Spec = {
  label: string;
  emoji: string;
  hint: string; // for the AI: when to use it and what params mean
  changes: boolean; // changes something on the laptop (vs only reads or shows)
  clean: (p: Params) => Params | string; // cleaned params, or an error message
  describe: (p: Params) => string;
};

const int = (v: unknown, min: number, max: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};
const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const mins = (n: number) => (n === 0 ? "never" : n < 60 ? `${n} min` : `${Math.floor(n / 60)}h${n % 60 ? ` ${n % 60}m` : ""}`);

export const ACTIONS: Record<ActionId, Spec> = {
  screen_timeout: {
    label: "Screen timeout",
    emoji: "🖥️",
    hint: "Set how long before the screen turns off when idle. params: {minutes: 0-240, 0 = never}",
    changes: true,
    clean: (p) => {
      const m = int(p.minutes, 0, 240);
      return m === null ? "Minutes must be between 0 and 240" : { minutes: m };
    },
    describe: (p) => `Turn the screen off after ${mins(Number(p.minutes))} of no use (plugged in and on battery)`,
  },
  sleep_timeout: {
    label: "Sleep timeout",
    emoji: "💤",
    hint: "Set how long before the laptop goes to sleep when idle. params: {minutes: 0-480, 0 = never}",
    changes: true,
    clean: (p) => {
      const m = int(p.minutes, 0, 480);
      return m === null ? "Minutes must be between 0 and 480" : { minutes: m };
    },
    describe: (p) => `Put the laptop to sleep after ${mins(Number(p.minutes))} of no use`,
  },
  open_url: {
    label: "Open a link",
    emoji: "🔗",
    hint: "Open an https web page in the laptop's browser. params: {url}",
    changes: false,
    clean: (p) => {
      try {
        const u = new URL(String(p.url ?? ""));
        return u.protocol === "https:" && u.toString().length <= 500 ? { url: u.toString() } : "Only https links up to 500 characters";
      } catch {
        return "Not a valid link";
      }
    },
    describe: (p) => `Open ${String(p.url)}`,
  },
  notify: {
    label: "Reminder on laptop",
    emoji: "🔔",
    hint: "Show a desktop notification. params: {title (max 60), body (max 200)}",
    changes: false,
    clean: (p) => {
      const title = text(p.title, 60);
      return title ? { title, body: text(p.body, 200) ?? "" } : "A title is needed";
    },
    describe: (p) => `Show “${String(p.title)}” on the laptop`,
  },
  lock_screen: {
    label: "Lock the laptop",
    emoji: "🔒",
    hint: "Lock the laptop now. params: {}",
    changes: true,
    clean: () => ({}),
    describe: () => "Lock the laptop now",
  },
  system_status: {
    label: "Laptop health",
    emoji: "🔋",
    hint: "Check battery, charging, free disk space and uptime. params: {}",
    changes: false,
    clean: () => ({}),
    describe: () => "Check battery, disk space and how long since a restart",
  },
  find_files: {
    label: "Find files",
    emoji: "🔎",
    hint: "Search file NAMES inside the folders the owner shared with Brain Link. params: {query (1-80 chars), limit (max 50)}",
    changes: false,
    clean: (p) => {
      const query = text(p.query, 80);
      return query ? { query, limit: int(p.limit, 1, 50) ?? 20 } : "What should I look for?";
    },
    describe: (p) => `Find files named like “${String(p.query)}” in your shared folders`,
  },
  read_file: {
    label: "Read a document",
    emoji: "📄",
    hint: "Read a text file (.md .txt .csv .json) from a shared folder so the assistant can remember it. params: {path} exactly as returned by find_files",
    changes: false,
    clean: (p) => {
      const path = text(p.path, 400);
      return path && /\.(md|txt|csv|json|log)$/i.test(path) ? { path } : "Only .md, .txt, .csv, .json or .log files";
    },
    describe: (p) => `Read ${String(p.path)} and add it to your assistant's memory`,
  },
  tidy_folder: {
    label: "Tidy a folder",
    emoji: "🧹",
    hint: "Sort loose files in one shared folder (by its name, e.g. Downloads) into subfolders by type. Always start with dry_run true. params: {folder, dry_run}",
    changes: true,
    clean: (p) => {
      const folder = text(p.folder, 60);
      return folder && !/[\\/]/.test(folder) ? { folder, dry_run: p.dry_run !== false } : "Pick one of your shared folders by name";
    },
    describe: (p) => (p.dry_run === false ? `Sort the loose files in ${String(p.folder)} into subfolders (can be undone)` : `Preview how ${String(p.folder)} would be tidied (moves nothing)`),
  },
  undo_tidy: {
    label: "Undo tidy",
    emoji: "↩️",
    hint: "Put files back where they were before the last tidy of a shared folder. params: {folder}",
    changes: true,
    clean: (p) => {
      const folder = text(p.folder, 60);
      return folder && !/[\\/]/.test(folder) ? { folder } : "Pick one of your shared folders by name";
    },
    describe: (p) => `Undo the last tidy of ${String(p.folder)}`,
  },
};

export const isAction = (a: unknown): a is ActionId => typeof a === "string" && a in ACTIONS;

export function validateAction(action: unknown, params: unknown): { ok: true; action: ActionId; params: Params } | { ok: false; error: string } {
  if (!isAction(action)) return { ok: false, error: "Brain Link can't do that yet" };
  const cleaned = ACTIONS[action].clean(params && typeof params === "object" ? (params as Params) : {});
  return typeof cleaned === "string" ? { ok: false, error: cleaned } : { ok: true, action, params: cleaned };
}

export const describeJob = (action: string, params: Params) => (isAction(action) ? ACTIONS[action].describe(params) : action);
