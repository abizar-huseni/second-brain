"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { toDay } from "@/lib/dates";
import { addDays } from "@/lib/ldates";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, gbp } from "@/lib/money";
import { countable, parseStatement } from "@/lib/statements";
import { cachedAccounts, lastSynced, syncBanks, type BankAccount } from "@/lib/bankClient";
import Progress from "@/components/Progress";
import { useSubTabs } from "@/lib/subtabs";
import WorkHours, { type Logged } from "@/components/WorkHours";
import { guessPayslip, pdfLines } from "@/lib/payslipPdf";
import type { Debt, Payslip, Transaction } from "@/lib/types";

type Tab = "month" | "banks" | "work" | "debts";
const TABS: { key: Tab; label: string }[] = [
  { key: "month", label: "This month" },
  { key: "banks", label: "Banks" },
  { key: "work", label: "Work" },
  { key: "debts", label: "Debts" },
];

export default function MoneyPage() {
  const [tab, setTab] = useState<Tab>("month");
  useSubTabs(TABS, tab, setTab);
  const [tx, setTx] = useState<Transaction[]>([]);
  const [slips, setSlips] = useState<Payslip[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [logged, setLogged] = useState<Logged>([]);

  const load = useCallback(async () => {
    const [t, p, d, c] = await Promise.all([
      supabase.from("transactions").select("*").order("day", { ascending: false }).order("created_at", { ascending: false }).limit(500),
      supabase.from("payslips").select("*").order("pay_date", { ascending: false }),
      supabase.from("debts").select("*").order("created_at"),
      supabase.from("checkins").select("day, hours_worked").gt("hours_worked", 0).gte("day", addDays(toDay(), -400)),
    ]);
    setLogged((c.data ?? []).map((r) => ({ day: r.day, hours: Number(r.hours_worked) })));
    setTx(t.data ?? []);
    setSlips(p.data ?? []);
    setDebts(d.data ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      {tab === "month" && <Month tx={tx} reload={load} />}
      {tab === "banks" && <Banks reload={load} />}
      {tab === "work" && (
        <>
          <WorkHours logged={logged} />
          <Payslips slips={slips} logged={logged} reload={load} />
        </>
      )}
      {tab === "debts" && <Debts debts={debts} reload={load} />}
    </div>
  );
}

function Month({ tx, reload }: { tx: Transaction[]; reload: () => void }) {
  const [kind, setKind] = useState<Transaction["kind"]>("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("food");
  const [note, setNote] = useState("");

  const month = toDay().slice(0, 7);
  const rows = countable(tx);
  // Moving money between your own accounts isn't income or spending.
  const thisMonth = rows.filter((t) => t.day.startsWith(month) && t.category !== "transfer");
  const income = thisMonth.filter((t) => t.kind === "income").reduce((s, t) => s + Number(t.amount), 0);
  const spent = thisMonth.filter((t) => t.kind === "expense").reduce((s, t) => s + Number(t.amount), 0);

  const byCategory = new Map<string, number>();
  for (const t of thisMonth.filter((t) => t.kind === "expense")) byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + Number(t.amount));
  const cats = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);

  async function add() {
    const value = Number(amount);
    if (!value) return;
    await supabase.from("transactions").insert({ kind, amount: value, category, note: note.trim() || null, day: toDay() });
    setAmount("");
    setNote("");
    reload();
  }

  async function recategorize(t: Transaction, category: string) {
    await supabase.from("transactions").update({ category }).eq("id", t.id);
    reload();
  }

  async function remove(t: Transaction) {
    if (!confirm("Delete this entry?")) return;
    await supabase.from("transactions").delete().eq("id", t.id);
    reload();
  }

  const categories = kind === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="In" value={gbp(income)} />
        <Stat label="Out" value={gbp(spent)} />
        <Stat label="Left" value={gbp(income - spent)} tone={income - spent < 0 ? "bad" : "good"} />
      </div>

      <div className="card space-y-2">
        <div className="seg">
          {(["expense", "income"] as const).map((k) => (
            <button
              key={k}
              aria-pressed={kind === k}
              onClick={() => {
                setKind(k);
                setCategory(k === "expense" ? "food" : "salary");
              }}
              className="seg-btn capitalize"
            >
              {k}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input className="input w-28" type="number" inputMode="decimal" step="0.01" placeholder="£0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <select className="input capitalize" value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <input className="input" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="btn btn-accent w-full" onClick={add}>Add {kind}</button>
      </div>

      <StatementImport reload={reload} />

      {cats.length > 0 && (
        <div className="card space-y-2">
          <p className="label">Where it went</p>
          {cats.map(([c, v]) => (
            <div key={c}>
              <div className="flex justify-between text-sm capitalize"><span>{c}</span><span className="tabular-nums">{gbp(v)}</span></div>
              <Progress value={v} max={spent} />
            </div>
          ))}
        </div>
      )}

      <ul className="card divide-y divide-[var(--line)]">
        {rows.slice(0, 30).map((t) => (
          <li key={t.id} className="flex items-center gap-2 py-2 text-sm">
            <span className="w-14 text-xs text-zinc-500">{new Date(t.day + "T12:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
            <select
              value={t.category}
              onChange={(e) => recategorize(t, e.target.value)}
              className="rounded bg-transparent text-sm capitalize outline-none"
            >
              {(t.kind === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <span className="min-w-0 truncate text-zinc-500">{t.note || t.description}</span>
            <span className={`ml-auto tabular-nums ${t.kind === "income" ? "text-emerald-600" : ""}`}>
              {t.kind === "income" ? "+" : "−"}{gbp(t.amount)}
            </span>
            <button onClick={() => remove(t)} className="text-xs text-zinc-400">✕</button>
          </li>
        ))}
        {!rows.length && <li className="py-2 text-center text-sm text-zinc-500">Nothing logged yet.</li>}
      </ul>
    </>
  );
}

function Banks({ reload }: { reload: () => void }) {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [synced, setSynced] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const cached = cachedAccounts();
    setAccounts(cached);
    setSynced(lastSynced());
    // The heartbeat syncs every 2 hours; show its balances when they're newer than this device's last sync.
    supabase
      .from("sync_status")
      .select("last_ok, info")
      .eq("source", "bank")
      .maybeSingle()
      .then(({ data }) => {
        const server = (data?.info as { accounts?: Partial<BankAccount>[] } | null)?.accounts;
        const localAt = lastSynced(); // read now, in case "Sync now" finished first
        if (!data?.last_ok || !server?.length) return;
        if (localAt && Date.parse(localAt) >= Date.parse(data.last_ok)) return;
        // The server doesn't keep logos yet, so reuse this device's.
        const logo = (a: Partial<BankAccount>) => a.logo ?? cached.find((c) => c.bank === a.bank && c.name === a.name)?.logo ?? null;
        setAccounts(server.map((a, i) => ({ id: a.id ?? i, name: a.name ?? "", bank: a.bank ?? "", logo: logo(a), status: a.status ?? "ACTIVE", balance: a.balance ?? null })));
        setSynced(data.last_ok);
      });
  }, []);

  async function sync() {
    setBusy(true);
    setStatus("Syncing your banks…");
    try {
      const r = await syncBanks();
      setAccounts(r.accounts);
      setSynced(lastSynced());
      setStatus(r.accounts.length ? `${r.added} new transactions.` : "No banks connected in Lunch Flow yet.");
      reload();
    } catch (e) {
      setStatus((e as Error).message);
    }
    setBusy(false);
  }

  const total = accounts.reduce((s, a) => s + (a.balance ?? 0), 0);

  return (
    <>
      <div className="card space-y-3">
        <div className="flex items-baseline justify-between">
          <p className="label mb-0">Across your banks</p>
          <p className="text-2xl font-semibold tabular-nums">{accounts.length ? gbp(total) : "–"}</p>
        </div>
        {accounts.map((a) => (
          <div key={a.id} className="flex items-center gap-2 text-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {a.logo && <img src={a.logo} alt="" className="h-5 w-5 rounded object-contain" />}
            <span>{a.bank} · {a.name}</span>
            {a.status !== "ACTIVE" && <span className="text-xs text-amber-600">reconnect in Lunch Flow</span>}
            <span className="ml-auto tabular-nums">{a.balance === null ? "–" : gbp(a.balance)}</span>
          </div>
        ))}
        <button className="btn btn-accent w-full" disabled={busy} onClick={sync}>{busy ? "Syncing…" : "Sync now"}</button>
        <p className="text-xs text-zinc-500">
          {synced ? `Last synced ${new Date(synced).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}. ` : ""}
          Banks are connected in Lunch Flow (read-only open banking). This app never sees your bank login.
        </p>
      </div>
      {status && <p className="text-sm text-zinc-500">{status}</p>}
    </>
  );
}

function StatementImport({ reload }: { reload: () => void }) {
  const [account, setAccount] = useState("Lloyds");
  const [status, setStatus] = useState("");

  async function importFile(file: File | undefined) {
    if (!file) return;
    setStatus("Reading…");
    const { bank, rows } = parseStatement(await file.text(), account);
    if (!rows.length) return setStatus("Couldn't find transactions in that file. Make sure it's a CSV export.");
    // Days a synced account at this bank already covers are skipped, so nothing is counted twice.
    const edge = (ascending: boolean) =>
      supabase.from("transactions").select("day").eq("source", "bank").ilike("account", `%${account}%`).order("day", { ascending }).limit(1).maybeSingle();
    const [first, last] = await Promise.all([edge(true), edge(false)]);
    const from = first.data?.day as string | undefined;
    const to = last.data?.day as string | undefined;
    const fresh = from && to ? rows.filter((r) => r.day < from || r.day > to) : rows;
    const before = await supabase.from("transactions").select("id", { count: "exact", head: true });
    for (let i = 0; i < fresh.length; i += 200) {
      const { error } = await supabase
        .from("transactions")
        .upsert(fresh.slice(i, i + 200), { onConflict: "user_id,external_id", ignoreDuplicates: true });
      if (error) return setStatus(`Error: ${error.message}`);
    }
    const after = await supabase.from("transactions").select("id", { count: "exact", head: true });
    const added = (after.count ?? 0) - (before.count ?? 0);
    const synced = rows.length - fresh.length;
    setStatus(`${bank} file: ${added} new transactions added, ${fresh.length - added} already there${synced ? `, ${synced} skipped (already synced from your bank)` : ""}.`);
    reload();
  }

  return (
    <div className="card space-y-2">
      <p className="label">Import bank statement (CSV)</p>
      <div className="seg">
        {["Lloyds", "HSBC"].map((a) => (
          <button key={a} onClick={() => setAccount(a)} aria-pressed={account === a} className="seg-btn">
            {a}
          </button>
        ))}
      </div>
      <label className="btn block cursor-pointer text-center">
        Choose {account} CSV
        <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { importFile(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      {status && <p className="text-sm text-zinc-500">{status}</p>}
      <p className="text-xs text-zinc-500">Re-importing the same file is safe. Wrong category? Tap it in the list below to change it.</p>
    </div>
  );
}

const SLIP_FIELDS = [
  ["gross", "Gross pay"],
  ["tax", "Income tax"],
  ["ni", "National Insurance"],
  ["pension", "Pension"],
  ["student_loan", "Student loan"],
  ["net", "Net pay (take home)"],
  ["hours", "Hours worked"],
] as const;

// Paid hours vs hours you logged since the previous payslip (or the 4 weeks before the first one).
// Pay can lag a week or two behind work, so this flags a gap to check rather than calling it wrong.
function hoursGap(p: Payslip, prev: Payslip | undefined, logged: Logged): string | null {
  if (p.hours == null) return null;
  const from = prev ? addDays(prev.pay_date, 1) : addDays(p.pay_date, -27);
  const mine = Math.round(logged.filter((l) => l.day >= from && l.day <= p.pay_date).reduce((t, l) => t + l.hours, 0) * 10) / 10;
  const paid = Number(p.hours);
  if (Math.abs(paid - mine) <= Math.max(2, paid * 0.1)) return null;
  const when = (d: string) => new Date(`${d}T12:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return paid > mine
    ? `Paid for ${paid}h, but you logged ${mine}h from ${when(from)} to ${when(p.pay_date)}. Your check-ins may be missing shifts.`
    : `You logged ${mine}h from ${when(from)} to ${when(p.pay_date)}, but were paid for ${paid}h. Check your rota and ask payroll if hours are missing.`;
}

function Payslips({ slips, logged, reload }: { slips: Payslip[]; logged: Logged; reload: () => void }) {
  const [form, setForm] = useState<Record<string, string>>({ pay_date: toDay(), employer: "" });
  const [open, setOpen] = useState(false);
  const [read, setRead] = useState("");

  // Reads the PDF on this device and fills the form. Nothing saves until you tap Save.
  async function readPdf(file: File | undefined) {
    if (!file) return;
    setRead("Reading your payslip…");
    try {
      const g = guessPayslip(await pdfLines(file));
      const found = Object.keys(g).length;
      setForm((f) => ({ ...f, ...g }));
      setOpen(true);
      setRead(found ? `Filled ${found} box${found > 1 ? "es" : ""} from ${file.name}. Check every number against the PDF, then save.` : "Couldn't find the numbers in that PDF (it may be a scan). Type them in below.");
    } catch {
      setOpen(true);
      setRead("Couldn't read that PDF. Type the numbers in below.");
    }
  }

  async function add() {
    const num = (k: string) => (form[k] ? Number(form[k]) : 0);
    if (!num("gross") || !num("net")) return alert("Gross and net pay are required.");
    const row = {
      pay_date: form.pay_date,
      employer: form.employer || null,
      hours: form.hours ? Number(form.hours) : null,
      gross: num("gross"),
      tax: num("tax"),
      ni: num("ni"),
      pension: num("pension"),
      student_loan: num("student_loan"),
      net: num("net"),
    };
    const { error } = await supabase.from("payslips").insert(row);
    if (error) return alert(error.message);
    // Take-home pay also counts as income for the month, unless bank sync covers the pay date or a CSV already has the pay.
    const { data: near } = await supabase
      .from("transactions")
      .select("source, kind, amount, category, day")
      .in("source", ["bank", "csv"])
      .gte("day", addDays(row.pay_date, -10))
      .lte("day", addDays(row.pay_date, 10));
    const paid = (near ?? []).some(
      (t) =>
        t.source === "bank" ||
        (t.kind === "income" && t.category !== "transfer" && Math.abs(Number(t.amount) - row.net) <= 1 && t.day >= addDays(row.pay_date, -5) && t.day <= addDays(row.pay_date, 5)),
    );
    if (!paid) await supabase.from("transactions").insert({ kind: "income", amount: row.net, category: "salary", note: row.employer ? `Payslip: ${row.employer}` : "Payslip", day: row.pay_date, source: "payslip" });
    setForm({ pay_date: toDay(), employer: form.employer });
    setOpen(false);
    setRead("");
    reload();
  }

  async function remove(p: Payslip) {
    if (!confirm("Delete this payslip and its income entry?")) return;
    await supabase.from("payslips").delete().eq("id", p.id);
    // Only one entry, so deleting a payslip saved twice keeps the other's. Older payslip entries were saved as "manual".
    const { data: entry } = await supabase
      .from("transactions")
      .select("id")
      .in("source", ["payslip", "manual"])
      .eq("category", "salary")
      .eq("note", p.employer ? `Payslip: ${p.employer}` : "Payslip")
      .eq("day", p.pay_date)
      .eq("amount", p.net)
      .limit(1)
      .maybeSingle();
    if (entry) await supabase.from("transactions").delete().eq("id", entry.id);
    reload();
  }

  const year = slips.filter((s) => s.pay_date >= `${new Date().getFullYear()}-01-01`);
  const totals = {
    gross: year.reduce((s, p) => s + Number(p.gross), 0),
    net: year.reduce((s, p) => s + Number(p.net), 0),
    hours: year.reduce((s, p) => s + Number(p.hours ?? 0), 0),
  };

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Gross this year" value={gbp(totals.gross)} />
        <Stat label="Net this year" value={gbp(totals.net)} />
        <Stat label="£/hour (net)" value={totals.hours ? gbp(totals.net / totals.hours) : "–"} />
      </div>

      {!open ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="btn btn-accent cursor-pointer text-center">
            📄 Read a payslip PDF
            <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => readPdf(e.target.files?.[0])} />
          </label>
          <button className="chip" onClick={() => setOpen(true)}>+ Type one in</button>
        </div>
      ) : (
        <div className="card space-y-2">
          {read && <p className="notice">{read}</p>}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Pay date</label>
              <input className="input" type="date" value={form.pay_date} onChange={(e) => setForm({ ...form, pay_date: e.target.value })} />
            </div>
            <div>
              <label className="label">Employer</label>
              <input className="input" value={form.employer ?? ""} onChange={(e) => setForm({ ...form, employer: e.target.value })} />
            </div>
            {SLIP_FIELDS.map(([k, label]) => (
              <div key={k}>
                <label className="label">{label}</label>
                <input className="input" type="number" inputMode="decimal" step="0.01" value={form[k] ?? ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button className="btn btn-accent flex-1" onClick={add}>Save payslip</button>
            <button
              className="chip px-4"
              onClick={() => {
                setOpen(false);
                setRead("");
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!open && read && <p className="notice">{read}</p>}

      <ul className="space-y-2">
        {slips.map((p, i) => {
          const gap = hoursGap(p, slips[i + 1], logged);
          return (
          <li key={p.id} className="card text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">{new Date(p.pay_date + "T12:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}{p.employer && ` · ${p.employer}`}</span>
              <button onClick={() => remove(p)} className="text-xs text-zinc-400">✕</button>
            </div>
            <div className="mt-1 grid grid-cols-3 gap-1 text-xs text-zinc-500">
              <span>Gross {gbp(p.gross)}</span>
              <span>Tax {gbp(p.tax)}</span>
              <span>NI {gbp(p.ni)}</span>
              <span>Pension {gbp(p.pension)}</span>
              <span>Hours {p.hours ?? "–"}</span>
              <span className="font-medium text-[var(--fg)]">Net {gbp(p.net)}</span>
            </div>
            {gap && <p className="notice mt-2 text-xs">{gap}</p>}
          </li>
          );
        })}
      </ul>
    </>
  );
}

function Debts({ debts, reload }: { debts: Debt[]; reload: () => void }) {
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");
  const [apr, setApr] = useState("");
  const [minPay, setMinPay] = useState("");

  async function add() {
    const b = Number(balance);
    if (!name.trim() || !b) return;
    await supabase.from("debts").insert({ name: name.trim(), start_balance: b, balance: b, apr: apr ? Number(apr) : null, min_payment: minPay ? Number(minPay) : null });
    setName("");
    setBalance("");
    setApr("");
    setMinPay("");
    reload();
  }

  async function pay(d: Debt) {
    const input = prompt(`Payment towards ${d.name} (£):`, d.min_payment ? String(d.min_payment) : "");
    const amount = Number(input);
    if (!amount) return;
    await supabase.from("debts").update({ balance: Math.max(0, Number(d.balance) - amount) }).eq("id", d.id);
    await supabase.from("transactions").insert({ kind: "expense", amount, category: "debt", note: d.name, day: toDay() });
    reload();
  }

  async function remove(d: Debt) {
    if (!confirm(`Delete ${d.name}?`)) return;
    await supabase.from("debts").delete().eq("id", d.id);
    reload();
  }

  const total = debts.reduce((s, d) => s + Number(d.balance), 0);
  const start = debts.reduce((s, d) => s + Number(d.start_balance), 0);

  return (
    <>
      <div className="card space-y-2">
        <div className="flex items-baseline justify-between">
          <p className="label mb-0">Total owed</p>
          <p className="text-2xl font-semibold tabular-nums">{gbp(total)}</p>
        </div>
        <Progress value={start - total} max={start} />
        <p className="text-xs text-zinc-500">{gbp(start - total)} paid off so far.</p>
      </div>

      {debts.map((d) => {
        const monthlyInterest = d.apr ? (Number(d.balance) * Number(d.apr)) / 100 / 12 : 0;
        return (
          <div key={d.id} className="card space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium">{d.name}</span>
              <button onClick={() => remove(d)} className="text-xs text-zinc-400">✕</button>
            </div>
            <Progress value={Number(d.start_balance) - Number(d.balance)} max={Number(d.start_balance)} />
            <div className="flex items-center justify-between text-sm">
              <span className="tabular-nums">{gbp(d.balance)} left</span>
              <button className="btn py-1" onClick={() => pay(d)}>Log payment</button>
            </div>
            {monthlyInterest > 0 && (
              <p className="text-xs text-amber-600">Costing you about {gbp(monthlyInterest)}/month in interest at {d.apr}% APR.</p>
            )}
          </div>
        );
      })}

      <div className="card space-y-2">
        <p className="label">Add a debt</p>
        <input className="input" placeholder="Name, e.g. Credit card, Klarna, Overdraft" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="grid grid-cols-3 gap-2">
          <input className="input" type="number" inputMode="decimal" placeholder="Owed £" value={balance} onChange={(e) => setBalance(e.target.value)} />
          <input className="input" type="number" inputMode="decimal" placeholder="APR %" value={apr} onChange={(e) => setApr(e.target.value)} />
          <input className="input" type="number" inputMode="decimal" placeholder="Min £/mo" value={minPay} onChange={(e) => setMinPay(e.target.value)} />
        </div>
        <button className="btn btn-accent w-full" onClick={add}>Add debt</button>
      </div>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="card px-2 text-center">
      <p className={`text-base font-semibold tabular-nums sm:text-lg ${tone === "bad" ? "text-rose-600" : tone === "good" ? "text-emerald-600" : ""}`}>{value}</p>
      <p className="text-xs text-zinc-500">{label}</p>
    </div>
  );
}
