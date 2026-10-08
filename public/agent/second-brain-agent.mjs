#!/usr/bin/env node
// Second Brain device agent. Runs on your Windows laptop or Android phone (Termux) and:
//   * sends a small status every 5 minutes (battery, storage, screen timeout, notes folder)
//   * notices things worth fixing and suggests them in your dashboard
//   * runs an action only after you approve it, and only if the approval is signed by a browser
//     this device trusts. The dashboard and database can't make it do anything on their own.
//   * keeps your Obsidian (or any markdown) folder synced into Notes, once you approve that
//
// No dependencies: Node 18+ only. Free and open source (MIT), like the rest of Second Brain.
//
//   node second-brain-agent.mjs pair <code>     connect this device (the dashboard gives you the code)
//   node second-brain-agent.mjs start           run (the installer sets this up to start on login/boot)
//   node second-brain-agent.mjs shell on|off    allow approved "run a command" actions (off by default)
//   node second-brain-agent.mjs check           test the connection once

import { execFile, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const VERSION = "1.0.0";
const IS_WIN = process.platform === "win32";
const IS_TERMUX = Boolean(process.env.PREFIX?.includes("com.termux")) || fs.existsSync("/data/data/com.termux");
const KIND = IS_WIN ? "windows" : IS_TERMUX ? "android" : "other";
const HOME = os.homedir();
const SHARED = IS_TERMUX && fs.existsSync(path.join(HOME, "storage", "shared")) ? path.join(HOME, "storage", "shared") : HOME;
const DIR = IS_WIN ? path.join(process.env.LOCALAPPDATA ?? HOME, "SecondBrainAgent") : path.join(HOME, ".second-brain-agent");
const CONFIG = path.join(DIR, "config.json");
const STATE = path.join(DIR, "state.json");
const LOG = path.join(DIR, "agent.log");
const PID = path.join(DIR, "agent.pid");
const MIN = 60 * 1000;
const MAX_APPROVAL_AGE = 7 * 24 * 60 * MIN;

// ---------- small helpers ----------

const readJson = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
};
const writeJson = (file, value) => {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), { mode: 0o600 });
};

function log(...parts) {
  const line = `${new Date().toISOString()} ${parts.join(" ")}\n`;
  try {
    if (fs.existsSync(LOG) && fs.statSync(LOG).size > 1_000_000) fs.renameSync(LOG, `${LOG}.old`);
    fs.appendFileSync(LOG, line);
  } catch {}
  if (process.stdout.isTTY) process.stdout.write(line);
}

// Same canonical JSON as the dashboard (src/lib/approver.ts): sorted keys, no spaces.
export function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}

export const keyId = (pub) => crypto.createHash("sha256").update(`${pub.x}.${pub.y}`).digest("base64url").slice(0, 16);

function run(file, args = [], { timeout = 60_000, input } = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, { timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message).toString().trim().slice(0, 1000)));
      else resolve(stdout.toString().trim());
    });
    if (input !== undefined) child.stdin.end(input);
  });
}

// PowerShell with the script passed as a base64 command, so nothing is ever parsed by cmd.exe.
const ps = (script, opts) => run("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], opts);
// A PowerShell string literal. Single quotes inside are doubled, so params can't break out.
const psq = (s) => `'${String(s).replace(/'/g, "''")}'`;

function detached(file, args) {
  const child = spawn(file, args, { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
  return child.pid;
}
const psDetached = (script) => detached("powershell.exe", ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")]);

const termux = (cmd, args = [], opts) => run(cmd, args, opts);

function insideHome(p) {
  const full = path.resolve(String(p).replace(/^~(?=$|[\\/])/, HOME));
  const real = fs.existsSync(full) ? fs.realpathSync(full) : full;
  const roots = [HOME, SHARED].map((r) => (fs.existsSync(r) ? fs.realpathSync(r) : r));
  if (!roots.some((r) => real === r || real.startsWith(r + path.sep))) throw new Error(`Only files inside ${HOME} are allowed.`);
  return real;
}

// ---------- config ----------

let cfg = readJson(CONFIG, null);
let state = readJson(STATE, { done_ids: [], vault_last: 0, vault_bulk_done: false });
const saveCfg = () => writeJson(CONFIG, cfg);
const saveState = () => writeJson(STATE, state);

async function rpc(fn, body) {
  const headers = { "content-type": "application/json", apikey: cfg.anon_key };
  if (!cfg.anon_key.startsWith("sb_")) headers.authorization = `Bearer ${cfg.anon_key}`;
  const res = await fetch(`${cfg.supabase_url}/rest/v1/rpc/${fn}`, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
  const text = await res.text();
  if (!res.ok) {
    if (/invalid device token/.test(text)) throw Object.assign(new Error("This device was disconnected in the dashboard. Pair it again from the Me page."), { fatal: true });
    if (/agent_poll|function .* does not exist/.test(text)) throw new Error("Run supabase/007_agent.sql in the Supabase SQL Editor first.");
    throw new Error(`${fn} ${res.status}: ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

// ---------- what this device can do ----------
// Each runner checks its own params. The dashboard only ever sends a name and params.

const num = (v, min, max, name) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${name} must be between ${min} and ${max}`);
  return n;
};
const str = (v, name, max = 500) => {
  if (typeof v !== "string" || !v.trim()) throw new Error(`Missing ${name}`);
  return v.slice(0, max);
};
const appName = (v) => {
  const n = str(v, "name", 60).replace(/\.exe$/i, "");
  if (!/^[\w .+-]+$/.test(n)) throw new Error("App names can only have letters, numbers, spaces, dots and dashes.");
  return n;
};
const httpUrl = (v) => {
  const u = new URL(str(v, "url", 2000));
  if (!/^https?:$/.test(u.protocol)) throw new Error("Only http and https links.");
  return u.toString();
};
const powerTargets = (when) => (when === "plugged" ? ["ac"] : when === "battery" ? ["dc"] : ["ac", "dc"]);
const FOCUS_DEFAULT = ["discord", "steam", "epicgameslauncher", "whatsapp"];

async function closeApps(names) {
  const closed = [];
  for (const n of names) {
    try {
      await ps(`Stop-Process -Name ${psq(n)} -Force -ErrorAction Stop`);
      closed.push(n);
    } catch {}
  }
  return closed;
}

async function toast(text) {
  if (IS_WIN) {
    const script = `[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
$t = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$x = $t.GetElementsByTagName('text')
$x.Item(0).AppendChild($t.CreateTextNode('Second Brain')) > $null
$x.Item(1).AppendChild($t.CreateTextNode(${psq(text)})) > $null
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe').Show([Windows.UI.Notifications.ToastNotification]::new($t))`;
    try {
      await ps(script);
    } catch {
      psDetached(`(New-Object -ComObject WScript.Shell).Popup(${psq(text)}, 0, 'Second Brain', 64) | Out-Null`);
    }
  } else if (IS_TERMUX) await termux("termux-notification", ["--title", "Second Brain", "--content", text]);
  else if (process.platform === "darwin") await run("osascript", ["-e", `display notification ${JSON.stringify(text)} with title "Second Brain"`]);
  else await run("notify-send", ["Second Brain", text]);
}

async function openUrl(url) {
  if (IS_WIN) await ps(`Start-Process ${psq(url)}`);
  else if (IS_TERMUX) await termux("termux-open-url", [url]);
  else await run(process.platform === "darwin" ? "open" : "xdg-open", [url]);
}

function walk(root, { maxDepth = 6, maxEntries = 30_000, onFile }) {
  let seen = 0;
  const skip = /^(node_modules|\.git|\.trash|AppData|Library|\$Recycle\.Bin|\.cache|\.npm)$/i;
  const visit = (dir, depth) => {
    if (depth > maxDepth || seen > maxEntries) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (++seen > maxEntries) return;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!skip.test(e.name) && !(e.name.startsWith(".") && e.name !== ".obsidian")) visit(full, depth + 1);
      } else if (e.isFile() && onFile(full, e.name) === false) return;
    }
  };
  visit(root, 0);
}

function folderPath(folder) {
  const base = IS_TERMUX ? SHARED : HOME;
  const named = { documents: ["Documents", "OneDrive/Documents"], desktop: ["Desktop", "OneDrive/Desktop"], downloads: ["Download", "Downloads"], home: [""] }[folder ?? "home"] ?? [""];
  for (const n of named) {
    const p = path.join(base, n);
    if (fs.existsSync(p)) return p;
  }
  return base;
}

function dirSize(p, budget = { n: 20_000 }) {
  let total = 0;
  try {
    const st = fs.lstatSync(p);
    if (!st.isDirectory()) return st.size;
    for (const e of fs.readdirSync(p)) {
      if (--budget.n < 0) break;
      total += dirSize(path.join(p, e), budget);
    }
  } catch {}
  return total;
}

const ACTIONS = {
  async screen_timeout(p) {
    const m = num(p.minutes, 0, 300, "minutes");
    if (!IS_WIN) throw new Error("Only on Windows for now.");
    for (const t of powerTargets(p.when)) await run("powercfg", ["/change", `monitor-timeout-${t}`, String(Math.round(m))]);
    return m === 0 ? "Done. The screen now stays on until you turn it off." : `Done. The screen now turns off after ${m} minutes of no use.`;
  },
  async sleep_timeout(p) {
    const m = num(p.minutes, 0, 600, "minutes");
    if (!IS_WIN) throw new Error("Only on Windows for now.");
    for (const t of powerTargets(p.when)) await run("powercfg", ["/change", `standby-timeout-${t}`, String(Math.round(m))]);
    return m === 0 ? "Done. The laptop won't go to sleep on its own." : `Done. The laptop now sleeps after ${m} minutes of no use.`;
  },
  async keep_awake(p) {
    const h = num(p.hours, 0.25, 12, "hours");
    if (!IS_WIN) throw new Error("Only on Windows for now.");
    if (state.awake_pid) {
      try {
        process.kill(state.awake_pid);
      } catch {}
    }
    state.awake_pid = psDetached(`Add-Type -Name P -Namespace W -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);'
$end = (Get-Date).AddMinutes(${Math.round(h * 60)})
while ((Get-Date) -lt $end) { [W.P]::SetThreadExecutionState([uint32]2147483651) | Out-Null; Start-Sleep -Seconds 30 }`);
    saveState();
    return `Done. Staying awake until ${new Date(Date.now() + h * 3600_000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`;
  },
  async lock() {
    await run("rundll32.exe", ["user32.dll,LockWorkStation"]);
    return "Locked.";
  },
  async sleep_now() {
    setTimeout(() => run("rundll32.exe", ["powrprof.dll,SetSuspendState", "0,1,0"]).catch(() => {}), 3000);
    return "Going to sleep. Good night.";
  },
  async shutdown(p) {
    const m = num(p.in_minutes, 1, 240, "in_minutes");
    await run("shutdown", ["/s", "/t", String(Math.round(m * 60))]);
    return `Shutting down in ${m} min.`;
  },
  async restart() {
    await run("shutdown", ["/r", "/t", "60"]);
    return "Restarting in 1 minute.";
  },
  async cancel_shutdown() {
    await run("shutdown", ["/a"]).catch((e) => {
      if (!/1116|no shutdown/i.test(e.message)) throw e;
    });
    return "Cancelled.";
  },
  async volume(p) {
    const l = num(p.level, 0, 100, "level");
    if (IS_TERMUX) {
      const streams = JSON.parse(await termux("termux-volume"));
      const music = streams.find((s) => s.stream === "music") ?? { max_volume: 15 };
      await termux("termux-volume", ["music", String(Math.round((l / 100) * music.max_volume))]);
    } else if (IS_WIN) await ps(`$w = New-Object -ComObject WScript.Shell; 1..50 | % { $w.SendKeys([char]174) }; 1..${Math.round(l / 2)} | % { $w.SendKeys([char]175) }`);
    else throw new Error("Not supported here.");
    return `Volume at ${l}%.`;
  },
  async mute() {
    await ps(`(New-Object -ComObject WScript.Shell).SendKeys([char]173)`);
    return "Toggled mute.";
  },
  async dark_mode(p) {
    const v = p.on ? "0" : "1";
    for (const key of ["AppsUseLightTheme", "SystemUsesLightTheme"]) await run("reg", ["add", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize", "/v", key, "/t", "REG_DWORD", "/d", v, "/f"]);
    return `${p.on ? "Dark" : "Light"} mode on.`;
  },
  async brightness(p) {
    const l = num(p.level, 0, 100, "level");
    if (IS_TERMUX) await termux("termux-brightness", [String(Math.round(l * 2.55))]);
    else if (IS_WIN) await ps(`Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods | Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{ Timeout = 1; Brightness = ${Math.round(l)} } | Out-Null`);
    else throw new Error("Not supported here.");
    return `Brightness at ${l}%.`;
  },
  async open_url(p) {
    const u = httpUrl(p.url);
    await openUrl(u);
    return `Opened ${u}.`;
  },
  async open_app(p) {
    const n = appName(p.name);
    await ps(`try { Start-Process ${psq(n)} -ErrorAction Stop } catch {
  $a = Get-StartApps | Where-Object { $_.Name -like ${psq(`*${n}*`)} } | Select-Object -First 1
  if (-not $a) { throw "Couldn't find an app called ${n.replace(/"/g, "")}." }
  Start-Process ("shell:AppsFolder\\" + $a.AppID)
}`);
    return `Opened ${n}.`;
  },
  async close_app(p) {
    const n = appName(p.name);
    const closed = await closeApps([n]);
    return closed.length ? `Closed ${n}.` : `${n} wasn't running.`;
  },
  async focus_mode(p) {
    const apps = (typeof p.apps === "string" && p.apps.trim() ? p.apps.split(",") : FOCUS_DEFAULT).map((a) => appName(a.trim())).slice(0, 20);
    const closed = await closeApps(apps);
    if (p.hours) {
      state.focus = { apps, until: Date.now() + num(p.hours, 0.25, 8, "hours") * 3600_000 };
      saveState();
    }
    return `${closed.length ? `Closed ${closed.join(", ")}.` : "None of them were open."}${p.hours ? ` I'll keep them closed for ${p.hours} hours.` : ""}`;
  },
  async notify(p) {
    await toast(str(p.text, "text", 300));
    return "Shown.";
  },
  async speak(p) {
    const t = str(p.text, "text", 500);
    if (IS_TERMUX) await termux("termux-tts-speak", [t]);
    else if (IS_WIN) await ps(`Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak(${psq(t)})`);
    else await run("spd-say", [t]);
    return "Said it.";
  },
  async clean_temp() {
    const tmp = os.tmpdir();
    const cutoff = Date.now() - 3 * 24 * 60 * MIN;
    let freed = 0;
    let removed = 0;
    for (const name of fs.readdirSync(tmp)) {
      const full = path.join(tmp, name);
      try {
        if (fs.lstatSync(full).mtimeMs > cutoff) continue;
        const size = dirSize(full);
        fs.rmSync(full, { recursive: true, force: true, maxRetries: 0 });
        freed += size;
        removed++;
      } catch {}
    }
    return `Removed ${removed} old temp items and freed ${(freed / 1e9).toFixed(2)} GB.`;
  },
  async empty_recycle_bin() {
    await ps("Clear-RecycleBin -Force -ErrorAction SilentlyContinue");
    return "Recycle bin emptied.";
  },
  async status() {
    const s = await snapshot();
    const lines = [
      s.battery !== undefined ? `Battery ${s.battery}%${s.charging ? " (charging)" : ""}` : null,
      s.disk_free !== undefined ? `Storage ${(s.disk_free / 1e9).toFixed(1)} GB free of ${(s.disk_total / 1e9).toFixed(0)} GB` : null,
      `Memory ${(s.mem_free / 1e9).toFixed(1)} GB free of ${(s.mem_total / 1e9).toFixed(1)} GB`,
      `On for ${s.uptime_hours} hours`,
      s.screen_off_min !== undefined ? `Screen turns off after ${s.screen_off_min || "never"} min when plugged in` : null,
    ].filter(Boolean);
    if (IS_WIN) {
      try {
        const top = JSON.parse(await ps("Get-Process | Sort-Object WS -Descending | Select-Object -First 6 Name, @{ n = 'MB'; e = { [int]($_.WS / 1MB) } } | ConvertTo-Json -Compress"));
        lines.push(`Using most memory: ${top.map((t) => `${t.Name} ${t.MB} MB`).join(", ")}`);
      } catch {}
    }
    return lines.join("\n");
  },
  async find_files(p) {
    const q = str(p.query, "query", 100).toLowerCase();
    const root = folderPath(p.folder);
    const found = [];
    walk(root, { onFile: (full, name) => (name.toLowerCase().includes(q) && found.push(full), found.length < 50) });
    return found.length ? found.join("\n") : `Nothing named like "${q}" in ${root}.`;
  },
  async read_file(p) {
    const file = insideHome(str(p.path, "path", 1000));
    const fd = fs.openSync(file, "r");
    const buf = Buffer.alloc(20_000);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    if (buf.subarray(0, Math.min(n, 1024)).includes(0)) throw new Error("That isn't a text file.");
    return buf.subarray(0, n).toString("utf8");
  },
  async torch(p) {
    await termux("termux-torch", [p.on ? "on" : "off"]);
    return `Torch ${p.on ? "on" : "off"}.`;
  },
  async vibrate() {
    await termux("termux-vibrate", ["-d", "1000", "-f"]);
    return "Buzzed.";
  },
  async find_phone() {
    await termux("termux-volume", ["ring", "15"]).catch(() => {});
    await termux("termux-volume", ["music", "15"]).catch(() => {});
    for (let i = 0; i < 5; i++) {
      await termux("termux-vibrate", ["-d", "800", "-f"]).catch(() => {});
      await termux("termux-tts-speak", ["I'm here"]).catch(() => {});
    }
    return "Rang it 5 times.";
  },
  async clipboard_to_note() {
    const text = IS_TERMUX ? await termux("termux-clipboard-get") : await ps("Get-Clipboard -Raw");
    if (!text.trim()) return "The clipboard is empty.";
    await rpc("agent_notes", { p_token: cfg.token, p_notes: [{ external_id: `clip:${Date.now()}`, title: "From clipboard", body: text.slice(0, 20000), tags: ["clipboard"], source: "clipboard" }], p_bulk: false });
    return `Saved ${text.length} characters to Notes.`;
  },
  async vault_sync(p) {
    const dir = insideHome(str(p.path, "path", 1000));
    if (!fs.statSync(dir).isDirectory()) throw new Error("That isn't a folder.");
    cfg.vault = dir;
    saveCfg();
    if (state.vault_path !== dir) Object.assign(state, { vault_path: dir, vault_last: 0, vault_bulk_done: false });
    saveState();
    const n = await syncVault();
    return `Syncing ${dir}. ${n} notes copied so far.`;
  },
  async vault_off() {
    cfg.vault = null;
    saveCfg();
    return "Notes sync stopped.";
  },
  async trust_key(p, ctx) {
    const id = str(p.id, "id", 40);
    const key = ctx.keys.find((k) => k.id === id);
    if (!key || keyId(key.pub) !== id) throw new Error("That key doesn't match its fingerprint. Not trusted.");
    if (!cfg.trusted_keys.some((k) => k.id === id)) cfg.trusted_keys.push({ id, name: String(p.name ?? key.name).slice(0, 60), pub: { kty: "EC", crv: "P-256", x: key.pub.x, y: key.pub.y } });
    saveCfg();
    return `${p.name ?? key.name} can now approve actions here.`;
  },
  async run(p) {
    if (!cfg.allow_shell) throw new Error(`Commands are switched off on this device. To allow them, run on the device: node "${path.join(DIR, "second-brain-agent.mjs")}" shell on`);
    const cmd = str(p.command, "command", 4000);
    const out = IS_WIN ? await ps(cmd, { timeout: 120_000 }) : await run("sh", ["-c", cmd], { timeout: 120_000 });
    return out.slice(-4000) || "Done (no output).";
  },
};

// ---------- status + suggestions ----------

async function snapshot() {
  const s = { agent: VERSION, kind: KIND, host: os.hostname(), uptime_hours: Math.round(os.uptime() / 360) / 10, mem_free: os.freemem(), mem_total: os.totalmem(), shell: Boolean(cfg.allow_shell), trusted: cfg.trusted_keys.map((k) => k.id), vault: cfg.vault ? { path: cfg.vault, last_sync: state.vault_last || null, notes: state.vault_count ?? 0 } : null };
  try {
    const st = fs.statfsSync(IS_WIN ? "C:\\" : SHARED);
    s.disk_free = st.bavail * st.bsize;
    s.disk_total = st.blocks * st.bsize;
  } catch {}
  if (IS_WIN) {
    try {
      const j = JSON.parse(
        await ps(`$b = Get-CimInstance Win32_Battery | Select-Object -First 1
$v = @(powercfg /query SCHEME_CURRENT SUB_VIDEO VIDEOIDLE | Select-String '0x[0-9a-fA-F]{8}' -AllMatches | % { $_.Matches } | % { $_.Value })
$z = @(powercfg /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE | Select-String '0x[0-9a-fA-F]{8}' -AllMatches | % { $_.Matches } | % { $_.Value })
@{ battery = $b.EstimatedChargeRemaining; charging = ($b.BatteryStatus -eq 2); video = $v; sleep = $z } | ConvertTo-Json -Compress`),
      );
      if (j.battery != null) Object.assign(s, { battery: j.battery, charging: j.charging });
      const last2 = (arr) => (arr?.length >= 2 ? arr.slice(-2).map((h) => Math.round(parseInt(h, 16) / 60)) : null);
      const v = last2(j.video);
      const z = last2(j.sleep);
      if (v) Object.assign(s, { screen_off_min: v[0], screen_off_min_battery: v[1] });
      if (z) Object.assign(s, { sleep_min: z[0], sleep_min_battery: z[1] });
    } catch (e) {
      log("snapshot", e.message);
    }
  } else if (IS_TERMUX) {
    try {
      const b = JSON.parse(await termux("termux-battery-status", [], { timeout: 15_000 }));
      Object.assign(s, { battery: b.percentage, charging: b.status === "CHARGING" || b.plugged !== "UNPLUGGED" });
    } catch {}
  }
  return s;
}

function findVault() {
  const roots = IS_TERMUX ? [path.join(SHARED, "Documents"), path.join(SHARED, "Obsidian"), SHARED] : [path.join(HOME, "Documents"), path.join(HOME, "OneDrive", "Documents"), path.join(HOME, "Desktop"), HOME];
  for (const root of roots) {
    let found = null;
    walk(root, {
      maxDepth: 3,
      maxEntries: 8000,
      onFile: (full) => {
        if (full.includes(`${path.sep}.obsidian${path.sep}`)) {
          found = full.slice(0, full.indexOf(`${path.sep}.obsidian${path.sep}`));
          return false;
        }
      },
    });
    if (found) return found;
  }
  return null;
}

async function suggestions(s, keys) {
  const out = [];
  const today = new Date().toLocaleDateString("en-CA");
  if (KIND === "windows" && s.screen_off_min !== undefined && s.screen_off_min > 0 && s.screen_off_min < 5)
    out.push({ action: "screen_timeout", params: { minutes: 15, when: "both" }, title: `Stop your screen going black after ${s.screen_off_min} min`, why: `Right now the screen turns off after ${s.screen_off_min} minute${s.screen_off_min === 1 ? "" : "s"} of no use. 15 minutes means it stays on while you read or think, and still saves battery.`, dedupe: `screen_timeout:${s.screen_off_min}` });
  if (s.disk_free !== undefined && s.disk_total && (s.disk_free < 8e9 || s.disk_free / s.disk_total < 0.08) && KIND === "windows")
    out.push({ action: "clean_temp", params: {}, title: `Free up space: only ${(s.disk_free / 1e9).toFixed(1)} GB left`, why: "A nearly full drive makes everything slow. Old temp files are safe to delete.", dedupe: `clean:${today}` });
  const h = new Date().getHours();
  if (KIND === "windows" && h >= 1 && h < 4)
    out.push({ action: "sleep_now", params: {}, title: `It's past ${h}am. Put the laptop to sleep?`, why: "Tomorrow's plan starts with tonight's sleep. Your work stays open.", dedupe: `latenight:${today}`, expires_min: 90 });
  if (KIND === "android" && s.battery !== undefined && s.battery <= 15 && !s.charging)
    out.push({ action: "brightness", params: { level: 30 }, title: `Phone at ${s.battery}%: dim the screen`, why: "The screen is the biggest battery drain. Charge it when you can.", dedupe: `lowbat:${today}:${h}`, expires_min: 120 });
  if (!cfg.vault && !state.vault_checked) {
    state.vault_checked = true;
    saveState();
    const v = findVault();
    if (v) out.push({ action: "vault_sync", params: { path: v }, title: `Bring your Obsidian notes into Second Brain`, why: `Found an Obsidian vault at ${v}. Your notes would show up in Notes, the mind map and your assistant's context, and stay in sync every 5 minutes.`, dedupe: `vault:${v}` });
  }
  for (const k of keys) {
    if (!cfg.trusted_keys.some((t) => t.id === k.id) && keyId(k.pub) === k.id)
      out.push({ action: "trust_key", params: { id: k.id, name: k.name }, title: `Let ${k.name} approve actions on ${os.hostname()}`, why: "A new browser signed in to your dashboard. Approve this from a browser you already use, so it can approve actions here too.", dedupe: `trust:${k.id}` });
  }
  return out;
}

const vaultTags = (body) => [...new Set((body.match(/#[\p{L}\p{N}_-]+/gu) ?? []).map((t) => t.slice(1).toLowerCase()))].concat("obsidian");

async function syncVault() {
  if (!cfg.vault || !fs.existsSync(cfg.vault)) return 0;
  const since = state.vault_last || 0;
  const started = Date.now();
  const changed = [];
  let total = 0;
  walk(cfg.vault, {
    maxDepth: 12,
    maxEntries: 50_000,
    onFile: (full, name) => {
      if (!name.endsWith(".md") || full.includes(`${path.sep}.obsidian${path.sep}`)) return;
      total++;
      const st = fs.statSync(full);
      if (st.mtimeMs > since) changed.push({ full, st });
    },
  });
  const bulk = !state.vault_bulk_done;
  let sent = 0;
  for (let i = 0; i < changed.length; i += 100) {
    const batch = changed.slice(i, i + 100).map(({ full, st }) => {
      const body = fs.readFileSync(full, "utf8").slice(0, 20000);
      const rel = path.relative(cfg.vault, full).split(path.sep).join("/");
      return { external_id: `obsidian:${rel}`, title: path.basename(full, ".md"), body: body.trim() || `(empty) ${rel}`, tags: vaultTags(body), created_at: new Date(st.birthtimeMs || st.mtimeMs).toISOString(), source: "obsidian" };
    });
    sent += await rpc("agent_notes", { p_token: cfg.token, p_notes: batch, p_bulk: bulk });
  }
  Object.assign(state, { vault_last: started, vault_bulk_done: true, vault_count: total });
  saveState();
  if (sent) log("vault", `${sent} notes synced`);
  return sent;
}

// ---------- approvals ----------

function verify(a) {
  if (a.device_id !== cfg.device_id) throw new Error("Meant for a different device.");
  if (state.done_ids.includes(a.id)) throw new Error("Already ran this one.");
  const key = cfg.trusted_keys.find((k) => k.id === a.key_id);
  if (!key) throw new Error("Not approved by a browser this device trusts.");
  const at = Date.parse(a.approved_at);
  if (!at || Date.now() - at > MAX_APPROVAL_AGE || at - Date.now() > 10 * MIN) throw new Error("Approval too old. Approve it again.");
  const msg = stable(["second-brain-approval-v1", a.id, a.device_id, a.action, a.params ?? {}, new Date(at).toISOString()]);
  const ok = crypto.verify("sha256", Buffer.from(msg), { key: crypto.createPublicKey({ key: key.pub, format: "jwk" }), dsaEncoding: "ieee-p1363" }, Buffer.from(a.signature ?? "", "base64url"));
  if (!ok) throw new Error("Signature check failed. Not running it.");
}

async function execute(a, ctx) {
  try {
    verify(a);
    const fn = ACTIONS[a.action];
    if (!fn) throw new Error(`This agent (v${VERSION}) doesn't know "${a.action}". Reinstall it from the Me page to update.`);
    state.done_ids = [...state.done_ids.slice(-499), a.id];
    saveState();
    log("run", a.action, JSON.stringify(a.params));
    const result = await fn(a.params ?? {}, ctx);
    return { id: a.id, status: "done", result: String(result ?? "Done.") };
  } catch (e) {
    log("fail", a.action, e.message);
    return { id: a.id, status: "failed", result: e.message };
  }
}

// ---------- main loop ----------

let results = [];
let lastInfo = 0;
let lastSuggest = 0;
let lastVault = 0;
let keys = [];
let failures = 0;

async function tick() {
  const info = Date.now() - lastInfo > 5 * MIN ? await snapshot() : null;
  const res = await rpc("agent_poll", { p_token: cfg.token, p_info: info, p_results: results });
  results = [];
  if (info) lastInfo = Date.now();
  keys = res.keys ?? [];
  // Results go back on the next poll, which comes straight away (see start).
  for (const a of res.actions ?? []) results.push(await execute(a, { keys }));
  if (results.length) lastInfo = 0;

  if (state.focus && state.focus.until > Date.now()) await closeApps(state.focus.apps);
  else if (state.focus) {
    delete state.focus;
    saveState();
  }

  if (Date.now() - lastSuggest > 10 * MIN) {
    lastSuggest = Date.now();
    const ideas = await suggestions(info ?? (await snapshot()), keys);
    if (ideas.length) {
      const n = await rpc("agent_propose", { p_token: cfg.token, p_actions: ideas });
      if (n > 0) fetch(`${cfg.app}/api/agent/notify`, { method: "POST", headers: { "x-device-token": cfg.token } }).catch(() => {});
    }
  }
  if (cfg.vault && Date.now() - lastVault > 5 * MIN) {
    lastVault = Date.now();
    await syncVault().catch((e) => log("vault", e.message));
  }
  return results.length > 0;
}

async function start() {
  if (!cfg) {
    console.error("Not paired yet. Get the install command from the Me page in your dashboard.");
    process.exit(1);
  }
  try {
    const old = Number(fs.readFileSync(PID, "utf8"));
    if (old && old !== process.pid) {
      process.kill(old, 0);
      console.error(`Already running (pid ${old}).`);
      process.exit(0);
    }
  } catch {}
  fs.writeFileSync(PID, String(process.pid));
  log("start", `v${VERSION}`, KIND, os.hostname());
  for (;;) {
    let hurry = false;
    try {
      hurry = await tick();
      failures = 0;
    } catch (e) {
      failures++;
      log("error", e.message);
      if (e.fatal) {
        await toast(e.message).catch(() => {});
        process.exit(1);
      }
    }
    // 15s normally; back off up to 5 min while offline.
    await new Promise((r) => setTimeout(r, hurry ? 500 : Math.min(15_000 * 2 ** Math.min(failures, 5), 5 * MIN)));
  }
}

async function pair(code) {
  const data = JSON.parse(Buffer.from(String(code), "base64url").toString("utf8"));
  if (!data.t || !data.d || !data.a) throw new Error("That pairing code is incomplete. Copy it again from the Me page.");
  const conf = await (await fetch(`${data.a}/api/agent/config`)).json();
  if (!conf.supabase_url || !conf.anon_key) throw new Error("The dashboard didn't return its database settings.");
  const trusted = (data.p ?? []).filter((k) => keyId(k.pub) === k.id).map((k) => ({ id: k.id, name: k.name, pub: { kty: "EC", crv: "P-256", x: k.pub.x, y: k.pub.y } }));
  if (!trusted.length) throw new Error("The pairing code has no approval key. Open the Me page in your browser and try again.");
  cfg = { app: data.a, supabase_url: conf.supabase_url, anon_key: conf.anon_key, token: data.t, device_id: data.d, trusted_keys: trusted, allow_shell: Boolean(cfg?.allow_shell), vault: cfg?.vault ?? null };
  saveCfg();
  await rpc("agent_poll", { p_token: cfg.token, p_info: await snapshot(), p_results: [] });
  console.log(`Paired as ${os.hostname()}. Approvals are trusted from: ${trusted.map((k) => k.name).join(", ")}.`);
}

const [cmd, arg] = process.argv.slice(2);
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const main = {
    pair: () => pair(arg),
    start,
    check: async () => {
      const r = await rpc("agent_poll", { p_token: cfg.token, p_info: await snapshot(), p_results: [] });
      console.log(`Connected as "${r.device.name}". ${r.actions.length} approved actions waiting.`);
    },
    shell: async () => {
      cfg.allow_shell = arg === "on";
      saveCfg();
      console.log(`Approved commands are now ${cfg.allow_shell ? "ALLOWED. Each one still needs your signed approval" : "off"}.`);
    },
  }[cmd ?? "start"];
  if (!main) {
    console.log("Usage: second-brain-agent.mjs pair <code> | start | check | shell on|off");
    process.exit(1);
  }
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
