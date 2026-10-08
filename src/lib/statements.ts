// Reads bank statement CSVs (Lloyds, HSBC, or any CSV with date/description/amount columns)
// into transactions. Runs in the browser.
import { categorize } from "./categorize";

export type ImportedTx = {
  day: string;
  kind: "income" | "expense";
  amount: number;
  category: string;
  description: string;
  account: string;
  source: "csv";
  external_id: string;
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cur.trim());
      cur = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cur.trim());
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
      cur = "";
    } else cur += ch;
  }
  row.push(cur.trim());
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

const MONTHS: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };

// 08/10/2026, 2026-10-08, 08 Oct 2026, 8-Oct-26 -> 2026-10-08
export function parseDate(s: string): string | null {
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? "20" + m[3] : m[3];
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[ -]([A-Za-z]{3})[A-Za-z]*[ -](\d{2,4})$/);
  if (m && MONTHS[m[2].toLowerCase()]) {
    const y = m[3].length === 2 ? "20" + m[3] : m[3];
    return `${y}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

const money = (s: string) => {
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || /-/.test(s) || /DR$/i.test(s);
  const n = Number(s.replace(/[£,()\s+-]|CR$|DR$/gi, ""));
  return isNaN(n) || s.replace(/[^\d]/g, "") === "" ? null : neg ? -n : n;
};

function findCol(header: string[], ...names: RegExp[]) {
  for (const re of names) {
    const i = header.findIndex((h) => re.test(h));
    if (i >= 0) return i;
  }
  return -1;
}

export function parseStatement(text: string, account: string): { bank: string; rows: ImportedTx[] } {
  const all = parseCsv(text);
  if (!all.length) return { bank: "unknown", rows: [] };

  const first = all[0].map((h) => h.toLowerCase());
  const hasHeader = parseDate(all[0][0] ?? "") === null;
  let bank = "csv";
  let date = 0, desc = 1, amount = 2, debit = -1, credit = -1, type = -1;
  let body = all;

  if (hasHeader) {
    body = all.slice(1);
    date = findCol(first, /transaction date/, /^date/, /date/);
    desc = findCol(first, /description/, /details/, /narrative/, /payee/, /merchant/, /reference/);
    amount = findCol(first, /^amount/, /value/);
    debit = findCol(first, /debit/, /paid out/, /money out/, /withdrawal/);
    credit = findCol(first, /credit/, /paid in/, /money in/, /deposit/);
    type = findCol(first, /transaction type/, /^type/);
    if (first.includes("debit amount") && first.includes("credit amount") && first.includes("sort code")) bank = "Lloyds";
  } else if (all[0].length >= 3) {
    bank = "HSBC"; // HSBC exports: date, description, signed amount, no header
  }
  if (date < 0 || desc < 0 || (amount < 0 && debit < 0 && credit < 0)) return { bank, rows: [] };

  const seen = new Map<string, number>();
  const rows: ImportedTx[] = [];
  for (const r of body) {
    const day = parseDate(r[date] ?? "");
    if (!day) continue;
    let value: number | null;
    if (amount >= 0 && debit < 0) value = money(r[amount] ?? "");
    else value = (money(r[credit] ?? "") ?? 0) - Math.abs(money(r[debit] ?? "") ?? 0);
    if (!value) continue;

    const description = [type >= 0 ? r[type] : "", r[desc] ?? ""].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    const isIncome = value > 0;
    // Same shop, same day, same amount twice? The counter keeps both, and re-importing stays duplicate-free.
    const key = `${account}|${day}|${description}|${value.toFixed(2)}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);

    rows.push({
      day,
      kind: isIncome ? "income" : "expense",
      amount: Math.abs(value),
      category: categorize(description, isIncome),
      description,
      account,
      source: "csv",
      external_id: `${key}|${n}`,
    });
  }
  return { bank, rows };
}
