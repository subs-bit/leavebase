/**
 * A small RFC-4180 CSV reader/writer.
 *
 * Written rather than pulled in because the import path must handle exactly one thing well:
 * a spreadsheet exported by a human, with quoted fields, embedded commas, stray whitespace and
 * a UTF-8 BOM from Excel.
 */

export type CsvRow = Record<string, string>;

/** Parse CSV text into rows keyed by the header names, lower-cased and trimmed. */
export function parseCsv(text: string): { headers: string[]; rows: CsvRow[]; error?: string } {
  const clean = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim();
  if (!clean) return { headers: [], rows: [], error: "The file is empty." };

  const table: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ",") { row.push(field); field = ""; continue; }
    if (c === "\n") { row.push(field); table.push(row); row = []; field = ""; continue; }
    field += c;
  }
  row.push(field);
  table.push(row);

  if (inQuotes) return { headers: [], rows: [], error: "A quoted field was never closed — check for a stray \" character." };
  if (table.length < 2) return { headers: [], rows: [], error: "The file has a header row but no data rows." };

  const headers = table[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, ""));
  const rows: CsvRow[] = [];

  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    if (cells.every((c) => c.trim() === "")) continue; // skip blank lines
    const obj: CsvRow = {};
    headers.forEach((h, i) => { obj[h] = (cells[i] ?? "").trim(); });
    obj.__line = String(r + 1);
    rows.push(obj);
  }

  return { headers, rows };
}

export function toCsv(rows: (string | number)[][]): string {
  return rows
    .map((r) =>
      r
        .map((cell) => {
          const s = String(cell ?? "");
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\r\n");
}

/** Accepts 2026-04-01, 01/04/2026, 1-4-2026 and Excel's 01-Apr-2026. Returns a day key or null. */
export function parseFlexibleDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    return valid(y, m, d);
  }
  // Day-first, which is what an Indian payroll export produces.
  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (dmy) return valid(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));

  const MONTHS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
  const named = s.match(/^(\d{1,2})[\-\s]([A-Za-z]{3,})[\-\s](\d{4})$/);
  if (named) {
    const mi = MONTHS.indexOf(named[2].slice(0, 3).toLowerCase());
    if (mi >= 0) return valid(Number(named[3]), mi + 1, Number(named[1]));
  }
  return null;
}

function valid(y: number, m: number, d: number): string | null {
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Tolerant number parse — blank and "-" mean "not provided", not zero. */
export function parseOptionalNumber(raw: string): number | null {
  const s = raw.trim();
  if (!s || s === "-" || s === "—") return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
}
