"use client";
// Sleep: debt, body clock, wake-ups in the night, and tonight's bedtime. One card, no clutter.
import Link from "next/link";
import { useEffect, useState } from "react";
import { clockMin, fmtClock, fmtDur, type Night, type SleepReport } from "@/lib/sleep";
import { guidanceByKey } from "@/lib/nhs";
import { useSleep } from "@/lib/useSleep";
import { buzz as tap } from "@/lib/feel";

const STARS = Array.from({ length: 18 }, (_, i) => ({
  left: (i * 37) % 100,
  top: (i * 53) % 60,
  delay: (i % 7) * 0.45,
  size: i % 5 === 0 ? 2 : 1,
}));

function debtTone(debt: number) {
  if (debt <= 30) return { ring: "#34d399", text: "text-emerald-300" };
  if (debt <= 180) return { ring: "#a5b4fc", text: "text-indigo-200" };
  if (debt <= 420) return { ring: "#fbbf24", text: "text-amber-300" };
  return { ring: "#fb7185", text: "text-rose-300" };
}

// Compact tile for Today.
export function SleepTile() {
  const { report, bedAt } = useSleep();
  if (!report) return <div className="skeleton h-[104px] rounded-[1.35rem]" />;
  const tone = debtTone(report.debtMin);
  return (
    <Link href="/health#sleep" className="card card-link relative block overflow-hidden !border-indigo-400/10 !bg-gradient-to-br from-indigo-950/90 to-slate-950/95 text-white">
      <Stars />
      <p className="relative text-[11px] font-semibold uppercase tracking-[0.12em] text-indigo-200/70">😴 Sleep</p>
      {bedAt ? (
        <p className="relative mt-1 text-lg font-semibold">In bed since {fmtClock(clockMin(bedAt))}</p>
      ) : report.debtNights ? (
        <>
          <p className={`relative mt-1 text-2xl font-semibold tabular-nums ${tone.text}`}>{report.debtMin <= 30 ? "Rested" : fmtDur(report.debtMin)}</p>
          <p className="relative text-xs text-indigo-100/60">{report.debtMin <= 30 ? "no sleep debt" : "sleep debt this week"}</p>
        </>
      ) : (
        <p className="relative mt-1 text-sm text-indigo-100/80">Tap to start tracking</p>
      )}
      {report.bedTonight !== null && !bedAt && <p className="relative mt-1 text-xs text-indigo-100/70">Bed by {fmtClock(report.bedTonight)}</p>}
    </Link>
  );
}

function Stars() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {STARS.map((s, i) => (
        <span
          key={i}
          className="twinkle absolute rounded-full bg-white"
          style={{ left: `${s.left}%`, top: `${s.top}%`, width: s.size, height: s.size, animationDelay: `${s.delay}s` }}
        />
      ))}
    </div>
  );
}

export default function SleepPanel() {
  const { report, bedAt, needMin, error, goingToSleep, cancelSleep, imUp, saveNight, setNeed } = useSleep();
  const [fixing, setFixing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (!report) return <div className="skeleton h-80 rounded-[1.35rem]" />;
  const tone = debtTone(report.debtMin);
  const pct = Math.min(1, report.debtMin / 600);

  return (
    <section id="sleep" className="card relative scroll-mt-6 overflow-hidden !border-indigo-400/10 !bg-gradient-to-b from-indigo-950 via-slate-950 to-slate-950 !p-0 text-white">
      <Stars />
      <div className="relative space-y-5 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-indigo-200/70">Sleep debt · last 7 nights</p>
            <p className={`mt-1 text-4xl font-semibold tracking-tight tabular-nums ${tone.text}`}>{report.debtNights ? (report.debtMin <= 30 ? "None" : fmtDur(report.debtMin)) : "–"}</p>
            <p className="mt-1 max-w-[28ch] text-sm text-indigo-100/75">{report.verdict}</p>
          </div>
          <DebtRing pct={pct} color={tone.ring} />
        </div>

        {/* Tonight */}
        <div className="flex flex-wrap items-center gap-2">
          {bedAt ? (
            <>
              <button className="btn btn-accent" onClick={() => { tap(); imUp(); }}>☀️ I&apos;m up</button>
              <span className="text-sm text-indigo-100/70">In bed {fmtDur((now - Date.parse(bedAt)) / 60000)}</span>
              <button className="text-xs text-indigo-200/60 underline" onClick={cancelSleep}>cancel</button>
            </>
          ) : (
            <>
              <button className="rounded-2xl bg-white/10 px-4 py-2.5 text-sm font-medium backdrop-blur transition active:scale-95" onClick={() => { tap(); goingToSleep(); }}>
                🌙 Going to sleep
              </button>
              {report.bedTonight !== null && (
                <span className="text-sm text-indigo-100/75">
                  Tonight: screens off {fmtClock(report.windDown)}, bed by <b className="text-white">{fmtClock(report.bedTonight)}</b>
                </span>
              )}
            </>
          )}
        </div>
        {error && <p className="text-sm text-amber-300">{error}</p>}

        {report.lastNight && <LastNight night={report.lastNight} />}

        {report.nights.length >= 2 && (
          <div className="grid grid-cols-[auto_1fr] items-center gap-4">
            <Dial report={report} now={now} />
            <div className="space-y-2 text-sm">
              {report.chronotype && (
                <p>
                  <span className="text-lg">{report.chronotype.emoji}</span> <b>{report.chronotype.label}</b>
                  <span className="block text-xs text-indigo-100/65">{report.chronotype.blurb}</span>
                </p>
              )}
              <p className="text-indigo-100/80">
                Usually <b className="text-white tabular-nums">{fmtClock(report.avgBed)}</b> → <b className="text-white tabular-nums">{fmtClock(report.avgWake)}</b>
                {report.spreadMin !== null && <span className="block text-xs text-indigo-100/60">bedtime varies ±{fmtDur(report.spreadMin)}{report.spreadMin > 60 ? ": too much" : ""}</span>}
              </p>
              {report.jetlagMin !== null && report.jetlagMin > 60 && (
                <p className="text-xs text-amber-200/90">Weekends shift your clock by {fmtDur(report.jetlagMin)}. That&apos;s jetlag without the holiday.</p>
              )}
              {report.wakeupsAvg !== null && (
                <p className="text-xs text-indigo-100/70">
                  Wakes {report.wakeupsAvg}× a night{report.wakeHour !== null ? `, often around ${report.wakeHour}:00` : ""}
                </p>
              )}
            </div>
          </div>
        )}

        {report.nights.length >= 2 && <Nights nights={report.nights} need={needMin} />}

        <Tips keys={report.tips} />

        <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-3 text-xs text-indigo-100/60">
          <label className="flex items-center gap-1.5">
            I need
            <select
              aria-label="Sleep need"
              value={needMin}
              onChange={(e) => setNeed(Number(e.target.value))}
              className="rounded-lg bg-white/10 px-1.5 py-0.5 text-white"
            >
              {[420, 450, 480, 510, 540].map((m) => (
                <option key={m} value={m} className="text-zinc-900">
                  {fmtDur(m)}
                </option>
              ))}
            </select>
          </label>
          <button className="underline" onClick={() => setFixing((f) => !f)}>
            {fixing ? "close" : "Log or fix a night"}
          </button>
        </div>
        {fixing && <FixNight onSave={async (b, w) => (await saveNight(b, w)) && setFixing(false)} />}
      </div>
    </section>
  );
}

function DebtRing({ pct, color }: { pct: number; color: string }) {
  const [p, setP] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setP(pct), 80);
    return () => clearTimeout(t);
  }, [pct]);
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <svg width="76" height="76" viewBox="0 0 76 76" className="shrink-0" aria-hidden>
      <circle cx="38" cy="38" r={r} fill="none" stroke="rgb(255 255 255 / 0.1)" strokeWidth="7" />
      <circle
        cx="38" cy="38" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - p)} transform="rotate(-90 38 38)" style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(0.2, 0.8, 0.2, 1)" }}
      />
      <text x="38" y="43" textAnchor="middle" fontSize="16">🌙</text>
    </svg>
  );
}

// Last night as a strip: deep blue asleep, amber awake.
function LastNight({ night }: { night: Night }) {
  const b = Date.parse(night.bed);
  const span = Date.parse(night.wake) - b;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-xs text-indigo-100/70">
        <span>Last night · {fmtDur(night.asleepMin)} asleep{night.manual ? " (logged by hand)" : ""}</span>
        {night.wakeups !== null && <span>{night.wakeups === 0 ? "slept straight through ✨" : `woke ${night.wakeups}× · ${fmtDur(night.awakeMin)}`}</span>}
      </div>
      <div className="relative h-3 overflow-hidden rounded-full bg-white/5">
        {night.segments.map((s, i) => (
          <span
            key={i}
            title={`${s.awake ? "Awake" : "Asleep"} ${fmtClock(clockMin(s.start))}–${fmtClock(clockMin(s.end))}`}
            className={`absolute inset-y-0 ${s.awake ? "bg-amber-300" : "bg-gradient-to-r from-indigo-400 to-violet-400"}`}
            style={{ left: `${((Date.parse(s.start) - b) / span) * 100}%`, width: `${Math.max(0.6, ((Date.parse(s.end) - Date.parse(s.start)) / span) * 100)}%` }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-indigo-100/50 tabular-nums">
        <span>{fmtClock(clockMin(night.bed))}</span>
        <span>{fmtClock(clockMin(night.wake))}</span>
      </div>
    </div>
  );
}

// 24-hour dial: your usual sleep window, and where you are now.
function Dial({ report, now }: { report: SleepReport; now: number }) {
  const size = 112;
  const cx = size / 2;
  const r = 42;
  const pt = (min: number, rad = r) => {
    const a = (min / 1440) * 2 * Math.PI - Math.PI / 2;
    return [cx + rad * Math.cos(a), cx + rad * Math.sin(a)];
  };
  const arc = (from: number, to: number) => {
    const len = (to - from + 1440) % 1440;
    const [x1, y1] = pt(from);
    const [x2, y2] = pt(to);
    return `M ${x1} ${y1} A ${r} ${r} 0 ${len > 720 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  const nowMin = clockMin(new Date(now).toISOString());
  const [nx, ny] = pt(nowMin, r);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label="Your usual sleep window on a 24 hour clock">
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="10" />
      {report.avgBed !== null && report.avgWake !== null && (
        <path d={arc(report.avgBed, report.avgWake)} fill="none" stroke="url(#sleepArc)" strokeWidth="10" strokeLinecap="round" />
      )}
      {report.bedTonight !== null && (() => {
        const [x, y] = pt(report.bedTonight, r + 11);
        return <text x={x} y={y + 3} textAnchor="middle" fontSize="9">🛏️</text>;
      })()}
      {[0, 6, 12, 18].map((h) => {
        const [x, y] = pt(h * 60, r - 17);
        return (
          <text key={h} x={x} y={y + 3} textAnchor="middle" fontSize="8" fill="rgb(255 255 255 / 0.45)">
            {h}
          </text>
        );
      })}
      <circle cx={nx} cy={ny} r="4" fill="#fde68a" className="animate-pulse" />
      <defs>
        <linearGradient id="sleepArc" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#818cf8" />
          <stop offset="1" stopColor="#c084fc" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// The last 14 nights as floating bars: when you slept, and whether it was enough.
function Nights({ nights, need }: { nights: Night[]; need: number }) {
  const list = [...nights].reverse();
  // Scale from 20:00 to 13:00 the next day.
  const pos = (iso: string) => {
    const m = (clockMin(iso) - 20 * 60 + 1440) % 1440;
    return Math.min(100, (m / (17 * 60)) * 100);
  };
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-indigo-200/60">Last {list.length} nights</p>
      <div className="flex h-28 items-stretch gap-1.5">
        {list.map((n) => {
          const top = pos(n.bed);
          const bottom = pos(n.wake);
          const ok = n.asleepMin >= need - 30;
          const dow = new Date(`${n.day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "narrow" });
          return (
            <div key={n.day} className="flex flex-1 flex-col items-center gap-1" title={`${n.day}: ${fmtDur(n.asleepMin)}`}>
              <div className="relative w-full flex-1 rounded-full bg-white/[0.03]">
                <span
                  className={`absolute inset-x-0 rounded-full ${ok ? "bg-gradient-to-b from-indigo-400 to-violet-400" : "bg-gradient-to-b from-amber-300 to-rose-400"}`}
                  style={{ top: `${top}%`, height: `${Math.max(4, bottom - top)}%` }}
                />
              </div>
              <span className="text-[10px] text-indigo-100/50">{dow}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-indigo-100/40">
        <span>8pm</span>
        <span>midnight</span>
        <span>1pm</span>
      </div>
    </div>
  );
}

function Tips({ keys }: { keys: string[] }) {
  const tips = keys.map(guidanceByKey).filter(Boolean);
  if (!tips.length) return null;
  return (
    <details className="group rounded-2xl bg-white/5 p-3 text-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between text-indigo-100/85">
        <span>🩺 What the NHS says</span>
        <span className="text-xs transition group-open:rotate-180">⌄</span>
      </summary>
      <ul className="mt-2 space-y-2">
        {tips.map((t) => (
          <li key={t!.key} className="text-indigo-100/75">
            {t!.fact}{" "}
            <a href={t!.url} target="_blank" rel="noreferrer" className="text-indigo-300 underline">
              {t!.source}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}

function FixNight({ onSave }: { onSave: (bed: string, wake: string) => void }) {
  const yday = new Date(Date.now() - 86400000).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const [bed, setBed] = useState(`${yday}T23:30`);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const [wake, setWake] = useState(`${today}T07:30`);
  return (
    <div className="grid grid-cols-2 gap-2 text-sm">
      <label className="space-y-1">
        <span className="text-xs text-indigo-100/60">Went to sleep</span>
        <input type="datetime-local" value={bed} onChange={(e) => setBed(e.target.value)} className="w-full rounded-xl bg-white/10 px-2 py-2 text-white [color-scheme:dark]" />
      </label>
      <label className="space-y-1">
        <span className="text-xs text-indigo-100/60">Woke up</span>
        <input type="datetime-local" value={wake} onChange={(e) => setWake(e.target.value)} className="w-full rounded-xl bg-white/10 px-2 py-2 text-white [color-scheme:dark]" />
      </label>
      <button className="btn btn-accent col-span-2" onClick={() => onSave(new Date(bed).toISOString(), new Date(wake).toISOString())}>
        Save night
      </button>
    </div>
  );
}
