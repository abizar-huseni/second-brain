// Reads a payslip PDF in the browser (nothing is uploaded) and guesses the numbers on it.
// Payslips differ by employer, so this only pre-fills the form: you check it before saving.

export type SlipGuess = Partial<Record<"pay_date" | "employer" | "hours" | "gross" | "tax" | "ni" | "pension" | "student_loan" | "net", string>>;

// Pulls the text out line by line (pdf.js gives words with positions; same height = same line).
export async function pdfLines(file: File): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Served from this site, so the strict security headers allow it.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  const lines: string[] = [];
  for (let n = 1; n <= Math.min(doc.numPages, 3); n++) {
    const page = await doc.getPage(n);
    const { items } = await page.getTextContent();
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const it of items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const y = Math.round(it.transform[5] / 3) * 3;
      const x = it.transform[4];
      rows.set(y, [...(rows.get(y) ?? []), { x, s: it.str.trim() }]);
    }
    [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .forEach(([, words]) => lines.push(words.sort((a, b) => a.x - b.x).map((w) => w.s).join(" ")));
  }
  await task.destroy();
  return lines;
}

const MONEY = /-?£?\s?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})|-?£?\s?\d+(?:\.\d{1,2})?/g;
const num = (s: string) => Number(s.replace(/[£,\s]/g, ""));

// First number after the label on its line (the "this period" column comes before "year to date"),
// or on the next line when the value sits under the label.
function after(lines: string[], label: RegExp, skip = /year to date|ytd|to date|cumulative/i): string | undefined {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(label);
    if (!m || skip.test(lines[i].slice(0, (m.index ?? 0) + m[0].length + 2))) continue;
    const rest = lines[i].slice((m.index ?? 0) + m[0].length);
    const here = rest.match(MONEY)?.map(num).find((v) => Number.isFinite(v));
    if (here !== undefined) return String(Math.abs(here));
    const next = lines[i + 1]?.match(MONEY)?.map(num).find((v) => Number.isFinite(v));
    if (next !== undefined) return String(Math.abs(next));
  }
}

const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec";
function findDate(lines: string[]): string | undefined {
  const toIso = (d: string, m: string, y: string) => {
    const yy = y.length === 2 ? `20${y}` : y;
    const mm = /^\d+$/.test(m) ? m.padStart(2, "0") : String(MONTHS.split("|").indexOf(m.slice(0, 3).toLowerCase()) + 1).padStart(2, "0");
    return `${yy}-${mm}-${d.padStart(2, "0")}`;
  };
  const rx = [new RegExp(`(\\d{1,2})[/.-](\\d{1,2})[/.-](\\d{2,4})`), new RegExp(`(\\d{1,2})\\s+(${MONTHS})[a-z]*\\.?\\s+(\\d{4})`, "i")];
  // Prefer a line that says it's the pay or payment date.
  const ordered = [...lines.filter((l) => /pay(ment)?\s*date|date paid|paid on/i.test(l)), ...lines];
  for (const l of ordered) {
    for (const r of rx) {
      const m = l.match(r);
      if (m) {
        const iso = toIso(m[1], m[2], m[3]);
        if (/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(iso)) return iso;
      }
    }
  }
}

// Hours: a "Total hours" line, otherwise the sum of hour columns on pay lines (Basic 20.00 hrs @ 11.44).
function findHours(lines: string[]): string | undefined {
  const total = after(lines, /total\s+hours|hours\s+(worked|paid)|^hours\b/i);
  if (total) return total;
  let sum = 0;
  for (const l of lines) {
    const m = l.match(/(\d+(?:\.\d+)?)\s*(?:hrs?|hours)\b/i) ?? l.match(/\b(?:basic|hourly|overtime|holiday)[a-z ]*\s(\d+(?:\.\d+)?)\s+(?:@|x)\s*£?\d/i);
    if (m && !/year to date|ytd/i.test(l)) {
      sum += Number(m[1]);
      continue;
    }
    // Columns "Hours Rate Amount": Basic Pay 42.50 11.44 486.20 (hours × rate ≈ amount).
    const n = /\b(basic|holiday|overtime|hourly|sunday|night|weekend|bank holiday)\b/i.test(l) ? (l.match(/\d+(?:,\d{3})*(?:\.\d+)?/g) ?? []).map(num) : [];
    if (n.length >= 3 && Math.abs(n[0] * n[1] - n[2]) <= Math.max(0.05, n[2] * 0.02)) sum += n[0];
  }
  return sum > 0 ? String(Math.round(sum * 100) / 100) : undefined;
}

export function guessPayslip(lines: string[]): SlipGuess {
  const g: SlipGuess = {
    pay_date: findDate(lines),
    gross: after(lines, /total\s+gross(\s+pay)?|gross\s+pay|gross\s+earnings|total\s+(payments|earnings)|\bgross\b/i),
    tax: after(lines, /\bpaye\b(\s+tax)?|income\s+tax|\btax\b(?!\s*(code|period|year|able))/i),
    ni: after(lines, /(employee'?s?\s+)?national\s+insurance|\bee\s*ni\b|\bnic?\b(?!\s*(no|number|letter|category|cat))/i),
    pension: after(lines, /(employee'?s?\s+)?pension|\bnest\b|salary\s+sacrifice/i),
    student_loan: after(lines, /student\s+loan|\bsl\s+deduction|postgrad(uate)?\s+loan/i),
    net: after(lines, /net\s+pay|take\s*home|amount\s+paid|net\s+payment|\bnet\b/i),
    hours: findHours(lines),
  };
  return Object.fromEntries(Object.entries(g).filter(([, v]) => v !== undefined)) as SlipGuess;
}
