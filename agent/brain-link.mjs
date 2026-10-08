#!/usr/bin/env node
// Brain Link: lets your Second Brain do small jobs on this laptop, only after you tap Approve in the app.
//
//   node brain-link.mjs setup    one-time: dashboard address, sync token, folders to share
//   node brain-link.mjs          run (keep it running; see README for starting it at login)
//   node brain-link.mjs status   show settings (without the token)
//
// Safety: it only ever calls out to your dashboard (no open ports), it can only do the fixed list of
// actions below (there is no "run any command"), it re-checks every job itself, and files are only
// read inside the folders you shared. Needs Node 18 or newer. No installs.

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

const VERSION = "1.0.0";
const DIR = path.join(os.homedir(), ".brain-link");
const CONFIG = path.join(DIR, "config.json");
const PLATFORM = process.platform; // win32 | darwin | linux
const TEXT_EXT = /\.(md|txt|csv|json|log)$/i;
const SKIP_DIRS = new Set(["node_modules", ".git", "AppData", "Library", ".cache", "$RECYCLE.BIN", ".Trash"]);

const log = (msg) => console.log(`${new Date().toLocaleTimeString("en-GB")}  ${msg}`);

// ---------- config ----------

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG, "utf8"));
  } catch {
    return null;
  }
}

function saveConfig(cfg) {
  fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

async function ask(q, { hidden = false } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) rl._writeToOutput = (s) => rl.output.write(s.includes(q) ? s : "");
  const answer = await new Promise((r) => rl.question(q, r));
  rl.close();
  if (hidden) process.stdout.write("\n");
  return answer.trim();
}

async function setup() {
  const old = loadConfig() ?? {};
  console.log("Brain Link setup. Press Enter to keep what's in [brackets].\n");
  const url = (await ask(`Dashboard address [${old.url ?? "https://second-brain-lac-tau.vercel.app"}]: `)) || old.url || "https://second-brain-lac-tau.vercel.app";
  if (!/^https:\/\/[^\s/]+/.test(url)) throw new Error("The address must start with https://");
  const token = (await ask("Sync token (Me page → Connections; typing is hidden): ", { hidden: true })) || old.token;
  if (!token) throw new Error("A sync token is needed.");
  const name = (await ask(`Name for this laptop [${old.name ?? os.hostname()}]: `)) || old.name || os.hostname();
  const defaults = old.folders ?? ["Documents", "Downloads"].map((f) => path.join(os.homedir(), f)).filter((f) => fs.existsSync(f));
  const raw = await ask(`Folders Brain Link may look in, comma separated [${defaults.join(", ")}]: `);
  const folders = (raw ? raw.split(",") : defaults)
    .map((f) => f.trim().replace(/^~(?=$|[\\/])/, os.homedir()))
    .filter(Boolean)
    .map((f) => path.resolve(f));
  for (const f of folders) if (!fs.existsSync(f)) throw new Error(`Folder not found: ${f}`);
  saveConfig({ url: url.replace(/\/+$/, ""), token, name: name.slice(0, 60), folders, device_id: old.device_id ?? randomUUID() });
  console.log(`\nSaved to ${CONFIG}. Start it with: node brain-link.mjs`);
}

// ---------- running programs safely (argument lists, never a command string) ----------

function run(cmd, args, { env, timeout = 20_000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, windowsHide: true, env: { ...process.env, ...env }, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message).toString().trim().slice(0, 300)));
      else resolve(stdout.toString());
    });
  });
}
const powershell = (script, env) => run("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], { env });

// ---------- shared folders ----------

async function sharedFolders(cfg) {
  const out = [];
  for (const f of cfg.folders ?? []) {
    try {
      out.push(await fsp.realpath(f));
    } catch {}
  }
  return out;
}

// True only if `p` (already resolved with realpath) is inside one of the shared folders.
function inside(p, roots) {
  const norm = (x) => (PLATFORM === "win32" ? x.toLowerCase() : x);
  return roots.some((r) => norm(p) === norm(r) || norm(p).startsWith(norm(r.endsWith(path.sep) ? r : r + path.sep)));
}

async function folderByName(cfg, name) {
  const roots = await sharedFolders(cfg);
  const hit = roots.find((r) => path.basename(r).toLowerCase() === String(name).toLowerCase());
  if (!hit) throw new Error(`"${name}" is not one of your shared folders (${roots.map((r) => path.basename(r)).join(", ")})`);
  return hit;
}

// ---------- actions ----------

const int = (v, min, max) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`Number must be between ${min} and ${max}`);
  return n;
};

const ACTIONS = {
  async screen_timeout(p) {
    const m = int(p.minutes, 0, 240);
    if (PLATFORM === "win32") {
      await run("powercfg", ["/change", "monitor-timeout-ac", String(m)]);
      await run("powercfg", ["/change", "monitor-timeout-dc", String(m)]);
    } else if (PLATFORM === "darwin") {
      await macAdmin(`pmset -a displaysleep ${m}`);
    } else {
      await run("gsettings", ["set", "org.gnome.desktop.session", "idle-delay", `uint32 ${m * 60}`]);
    }
    return { message: m === 0 ? "Screen will stay on." : `Screen turns off after ${m} min.` };
  },

  async sleep_timeout(p) {
    const m = int(p.minutes, 0, 480);
    if (PLATFORM === "win32") {
      await run("powercfg", ["/change", "standby-timeout-ac", String(m)]);
      await run("powercfg", ["/change", "standby-timeout-dc", String(m)]);
    } else if (PLATFORM === "darwin") {
      await macAdmin(`pmset -a sleep ${m}`);
    } else {
      for (const k of ["sleep-inactive-ac-timeout", "sleep-inactive-battery-timeout"]) await run("gsettings", ["set", "org.gnome.settings-daemon.plugins.power", k, String(m * 60)]);
    }
    return { message: m === 0 ? "Laptop won't sleep on its own." : `Laptop sleeps after ${m} min.` };
  },

  async open_url(p) {
    const u = new URL(String(p.url));
    if (u.protocol !== "https:") throw new Error("Only https links");
    const url = u.toString();
    if (PLATFORM === "win32") await run("rundll32.exe", ["url.dll,FileProtocolHandler", url]);
    else if (PLATFORM === "darwin") await run("open", [url]);
    else await run("xdg-open", [url]);
    return { message: `Opened ${u.hostname}` };
  },

  async notify(p) {
    const title = String(p.title ?? "Second Brain").slice(0, 60);
    const body = String(p.body ?? "").slice(0, 200);
    // Text goes in through environment variables, so it can never be read as code.
    const env = { BL_TITLE: title, BL_BODY: body };
    if (PLATFORM === "win32") {
      await powershell(
        `[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
$t = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$x = $t.GetElementsByTagName('text'); $x.Item(0).AppendChild($t.CreateTextNode($env:BL_TITLE)) > $null; $x.Item(1).AppendChild($t.CreateTextNode($env:BL_BODY)) > $null
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe').Show([Windows.UI.Notifications.ToastNotification]::new($t))`,
        env,
      );
    } else if (PLATFORM === "darwin") {
      await run("osascript", ["-e", 'display notification (system attribute "BL_BODY") with title (system attribute "BL_TITLE")'], { env });
    } else {
      await run("notify-send", [title, body]);
    }
    return { message: "Shown" };
  },

  async lock_screen() {
    if (PLATFORM === "win32") await run("rundll32.exe", ["user32.dll,LockWorkStation"]);
    else if (PLATFORM === "darwin") await run("pmset", ["displaysleepnow"]);
    else await run("loginctl", ["lock-session"]);
    return { message: "Locked" };
  },

  async system_status(_p, cfg) {
    return { ...(await status(cfg)), message: "Checked" };
  },

  async find_files(p, cfg) {
    const query = String(p.query ?? "").toLowerCase().trim().slice(0, 80);
    if (!query) throw new Error("Nothing to search for");
    const limit = int(p.limit ?? 20, 1, 50);
    const roots = await sharedFolders(cfg);
    const found = [];
    let scanned = 0;
    async function walk(dir, depth) {
      if (depth > 6 || found.length >= limit || scanned > 5000) return;
      let entries = [];
      try {
        entries = await fsp.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (found.length >= limit || ++scanned > 5000) return;
        if (e.isSymbolicLink() || e.name.startsWith(".")) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (!SKIP_DIRS.has(e.name)) await walk(full, depth + 1);
        } else if (e.isFile() && e.name.toLowerCase().includes(query)) {
          const st = await fsp.stat(full).catch(() => null);
          found.push({ path: full, size_kb: st ? Math.round(st.size / 1024) : null, modified: st?.mtime.toISOString().slice(0, 10) ?? null });
        }
      }
    }
    for (const r of roots) await walk(r, 0);
    return { files: found, message: `${found.length} found` };
  },

  async read_file(p, cfg) {
    const asked = String(p.path ?? "").replace(/^~(?=$|[\\/])/, os.homedir());
    if (!TEXT_EXT.test(asked)) throw new Error("Only .md, .txt, .csv, .json or .log files");
    const real = await fsp.realpath(path.resolve(asked)).catch(() => null);
    if (!real) throw new Error("File not found");
    if (!inside(real, await sharedFolders(cfg))) throw new Error("That file is outside your shared folders");
    if (!TEXT_EXT.test(real)) throw new Error("Only text files");
    const st = await fsp.stat(real);
    if (!st.isFile() || st.size > 200 * 1024) throw new Error("File is missing or bigger than 200 KB");
    const text = (await fsp.readFile(real, "utf8")).slice(0, 20_000);
    return { path: real, text, message: `Read ${path.basename(real)}` };
  },

  async tidy_folder(p, cfg) {
    const root = await folderByName(cfg, p.folder);
    const dry = p.dry_run !== false;
    const plan = [];
    for (const e of await fsp.readdir(root, { withFileTypes: true })) {
      if (!e.isFile() || e.name.startsWith(".") || e.name.startsWith("~$")) continue;
      plan.push({ name: e.name, to: kindOf(e.name) });
    }
    if (dry) {
      const counts = plan.reduce((m, x) => ({ ...m, [x.to]: (m[x.to] ?? 0) + 1 }), {});
      return { dry_run: true, counts, message: plan.length ? `Would sort ${plan.length} files: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")}` : "Already tidy" };
    }
    const moved = [];
    for (const x of plan) {
      const dir = path.join(root, x.to);
      await fsp.mkdir(dir, { recursive: true });
      let target = path.join(dir, x.name);
      for (let i = 2; fs.existsSync(target) && i < 100; i++) {
        const ext = path.extname(x.name);
        target = path.join(dir, `${path.basename(x.name, ext)} (${i})${ext}`);
      }
      if (fs.existsSync(target)) continue; // never overwrite
      await fsp.rename(path.join(root, x.name), target);
      moved.push({ from: path.join(root, x.name), to: target });
    }
    const undo = path.join(root, `.brain-link-undo-${Date.now()}.json`);
    await fsp.writeFile(undo, JSON.stringify(moved, null, 2));
    return { moved: moved.length, message: `Sorted ${moved.length} files. Undo is possible.` };
  },

  async undo_tidy(p, cfg) {
    const root = await folderByName(cfg, p.folder);
    const logs = (await fsp.readdir(root)).filter((f) => /^\.brain-link-undo-\d+\.json$/.test(f)).sort();
    if (!logs.length) throw new Error("Nothing to undo");
    const file = path.join(root, logs.at(-1));
    const moves = JSON.parse(await fsp.readFile(file, "utf8"));
    let back = 0;
    for (const m of moves) {
      // Only move files that are still inside this folder and whose old place is free.
      const from = path.resolve(m.to);
      const to = path.resolve(m.from);
      if (!inside(from, [root]) || !inside(to, [root]) || fs.existsSync(to) || !fs.existsSync(from)) continue;
      await fsp.rename(from, to);
      back++;
    }
    await fsp.rename(file, `${file}.done`);
    for (const [kind] of KINDS.concat([["Other"]])) await fsp.rmdir(path.join(root, kind)).catch(() => {}); // only removes empty ones
    return { restored: back, message: `Put back ${back} files` };
  },
};

const KINDS = [
  ["Images", /\.(jpe?g|png|gif|webp|heic|svg|bmp)$/i],
  ["Videos", /\.(mp4|mov|mkv|avi|webm)$/i],
  ["Audio", /\.(mp3|wav|m4a|aac|flac|ogg)$/i],
  ["Documents", /\.(pdf|docx?|xlsx?|pptx?|odt|ods|txt|md|csv|rtf|pages|numbers|key)$/i],
  ["Archives", /\.(zip|rar|7z|tar|gz|tgz)$/i],
  ["Installers", /\.(exe|msi|dmg|pkg|apk|deb|appimage)$/i],
  ["Code", /\.(py|ipynb|js|ts|sql|html|css|json|ya?ml|r)$/i],
];
const kindOf = (name) => KINDS.find(([, re]) => re.test(name))?.[0] ?? "Other";

// macOS power settings need an admin password: macOS asks you for it in its own window.
async function macAdmin(command) {
  if (!/^pmset -a (displaysleep|sleep) \d{1,3}$/.test(command)) throw new Error("Blocked");
  await run("osascript", ["-e", `do shell script "${command}" with administrator privileges`], { timeout: 120_000 });
}

// ---------- status ----------

async function battery() {
  try {
    if (PLATFORM === "win32") {
      const out = await powershell("Get-CimInstance Win32_Battery | Select-Object EstimatedChargeRemaining,BatteryStatus | ConvertTo-Json -Compress");
      const b = JSON.parse(out || "null");
      const one = Array.isArray(b) ? b[0] : b;
      return one ? { battery: one.EstimatedChargeRemaining, charging: one.BatteryStatus === 2 } : {};
    }
    if (PLATFORM === "darwin") {
      const out = await run("pmset", ["-g", "batt"]);
      const m = out.match(/(\d+)%;\s*(\w+)/);
      return m ? { battery: Number(m[1]), charging: /charg/i.test(m[2]) && !/discharg/i.test(m[2]) } : {};
    }
    const dirs = (await fsp.readdir("/sys/class/power_supply")).filter((d) => d.startsWith("BAT"));
    if (!dirs.length) return {};
    const cap = await fsp.readFile(`/sys/class/power_supply/${dirs[0]}/capacity`, "utf8");
    const st = await fsp.readFile(`/sys/class/power_supply/${dirs[0]}/status`, "utf8");
    return { battery: Number(cap), charging: /charging|full/i.test(st) && !/discharg/i.test(st) };
  } catch {
    return {};
  }
}

async function status(cfg) {
  let disk = null;
  try {
    const s = await fsp.statfs(os.homedir());
    disk = Math.round(((s.bavail * s.bsize) / 1024 ** 3) * 10) / 10;
  } catch {}
  return {
    ...(await battery()),
    disk_free_gb: disk,
    uptime_h: Math.round((os.uptime() / 3600) * 10) / 10,
    platform: PLATFORM,
    folders: (cfg.folders ?? []).map((f) => path.basename(f)),
  };
}

// ---------- main loop ----------

async function call(cfg, route, body) {
  const res = await fetch(`${cfg.url}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-sync-token": cfg.token, "user-agent": `brain-link/${VERSION}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

const OS_NAME = { win32: "Windows", darwin: "macOS", linux: "Linux" }[PLATFORM] ?? PLATFORM;
const SUPPORTED = Object.keys(ACTIONS);

async function loop() {
  const cfg = loadConfig();
  if (!cfg?.token) {
    console.log("Not set up yet. Run: node brain-link.mjs setup");
    process.exit(1);
  }
  log(`Brain Link ${VERSION} on ${OS_NAME}. Shared folders: ${(cfg.folders ?? []).join(", ") || "none"}`);
  log(`Waiting for jobs you approve at ${cfg.url}`);
  let wait = 15_000;
  let lastStatus = 0;
  let info = null;
  for (;;) {
    try {
      if (!info || Date.now() - lastStatus > 5 * 60_000) {
        info = await status(cfg);
        lastStatus = Date.now();
      }
      const { jobs = [] } = await call(cfg, "/api/agent/poll", { device_id: cfg.device_id, name: cfg.name, os: OS_NAME, actions: SUPPORTED, info });
      for (const job of jobs) {
        const fn = ACTIONS[job.action];
        log(`Approved: ${job.action} ${JSON.stringify(job.params ?? {})}`);
        try {
          if (!fn) throw new Error("This laptop can't do that");
          const result = await fn(job.params ?? {}, cfg);
          await call(cfg, "/api/agent/result", { id: job.id, ok: true, result });
          log(`  done: ${result.message ?? "ok"}`);
        } catch (e) {
          await call(cfg, "/api/agent/result", { id: job.id, ok: false, error: e.message }).catch(() => {});
          log(`  failed: ${e.message}`);
        }
      }
      wait = 15_000;
    } catch (e) {
      wait = Math.min(wait * 2, 5 * 60_000);
      log(`Can't reach the dashboard (${e.message}). Retrying in ${Math.round(wait / 1000)}s.`);
    }
    await new Promise((r) => setTimeout(r, wait));
  }
}

const cmd = process.argv[2];
if (cmd === "setup") setup().catch((e) => (console.error(`Setup failed: ${e.message}`), process.exit(1)));
else if (cmd === "status") {
  const cfg = loadConfig();
  console.log(cfg ? JSON.stringify({ ...cfg, token: cfg.token ? "(saved)" : "(missing)" }, null, 2) : "Not set up yet. Run: node brain-link.mjs setup");
} else loop();
