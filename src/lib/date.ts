/**
 * Business-date primitives.
 *
 * A "leave day" is a calendar date, not an instant. Every date in LeaveBase is normalised to
 * UTC midnight and moved around as a `YYYY-MM-DD` key so that a request made at 11pm IST never
 * silently shifts a day. All comparisons happen on the key, never on the Date object.
 */

export type DayKey = string; // "YYYY-MM-DD"

const MS_DAY = 86_400_000;

/** Date (any tz) → "YYYY-MM-DD" using its UTC parts. */
export function dayKey(d: Date | string): DayKey {
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" → Date at exactly UTC midnight. */
export function fromKey(key: DayKey): Date {
  return new Date(`${key.slice(0, 10)}T00:00:00.000Z`);
}

/** Normalise any Date to UTC midnight of the same calendar day. */
export function toDay(d: Date | string): Date {
  return fromKey(dayKey(d));
}

/** Local "today" as a day key — uses the browser/server local calendar day. */
export function todayKey(now: Date = new Date()): DayKey {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDaysKey(key: DayKey, n: number): DayKey {
  return dayKey(new Date(fromKey(key).getTime() + n * MS_DAY));
}

/** Whole days from a → b. Negative if b is before a. */
export function diffDays(a: DayKey, b: DayKey): number {
  return Math.round((fromKey(b).getTime() - fromKey(a).getTime()) / MS_DAY);
}

/** Inclusive list of day keys from start to end. */
export function eachDayKey(start: DayKey, end: DayKey): DayKey[] {
  const out: DayKey[] = [];
  if (diffDays(start, end) < 0) return out;
  let cur = start;
  // Hard stop guards against a pathological range locking the request thread.
  for (let i = 0; i <= 1100 && diffDays(cur, end) >= 0; i++) {
    out.push(cur);
    cur = addDaysKey(cur, 1);
  }
  return out;
}

/** 0 = Sunday … 6 = Saturday, in UTC. */
export function weekdayOf(key: DayKey): number {
  return fromKey(key).getUTCDay();
}

export function isSameDay(a: DayKey, b: DayKey): boolean {
  return a === b;
}

export function maxKey(a: DayKey, b: DayKey): DayKey {
  return diffDays(a, b) >= 0 ? b : a;
}

export function minKey(a: DayKey, b: DayKey): DayKey {
  return diffDays(a, b) >= 0 ? a : b;
}

export function clampKey(key: DayKey, lo: DayKey, hi: DayKey): DayKey {
  return minKey(maxKey(key, lo), hi);
}

// ── formatting ────────────────────────────────────────────────────────────────

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MON = MONTHS.map((m) => m.slice(0, 3));
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function monthName(i: number, short = false): string {
  return short ? MON[i] : MONTHS[i];
}

export function weekdayName(i: number, short = false): string {
  return short ? DAYS[i].slice(0, 3) : DAYS[i];
}

/** "12 Aug 2026" */
export function fmtDate(key: DayKey | Date): string {
  const k = typeof key === "string" ? key : dayKey(key);
  const d = fromKey(k);
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "12 Aug" */
export function fmtDateShort(key: DayKey | Date): string {
  const k = typeof key === "string" ? key : dayKey(key);
  const d = fromKey(k);
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
}

/** "Wed, 12 Aug 2026" */
export function fmtDateFull(key: DayKey | Date): string {
  const k = typeof key === "string" ? key : dayKey(key);
  const d = fromKey(k);
  return `${DAYS[d.getUTCDay()].slice(0, 3)}, ${fmtDate(k)}`;
}

/** A date range rendered as compactly as it can be without losing clarity. */
export function fmtRange(start: DayKey, end: DayKey): string {
  if (start === end) return fmtDate(start);
  const a = fromKey(start);
  const b = fromKey(end);
  if (a.getUTCFullYear() === b.getUTCFullYear()) {
    if (a.getUTCMonth() === b.getUTCMonth()) {
      return `${a.getUTCDate()}–${b.getUTCDate()} ${MON[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
    }
    return `${fmtDateShort(start)} – ${fmtDate(end)}`;
  }
  return `${fmtDate(start)} – ${fmtDate(end)}`;
}

/** "in 12 days" / "3 days ago" / "today" */
export function relativeDays(key: DayKey, from: DayKey = todayKey()): string {
  const n = diffDays(from, key);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  if (n > 0) return `in ${n} days`;
  return `${Math.abs(n)} days ago`;
}

/** "2 hours ago" for timestamps in the activity feed. */
export function timeAgo(d: Date | string, now: Date = new Date()): string {
  const t = typeof d === "string" ? new Date(d) : d;
  const s = Math.floor((now.getTime() - t.getTime()) / 1000);
  // A timestamp in the future is a data problem, not a rendering one — say so rather than
  // silently reporting it as "just now".
  if (s < -60) return "scheduled";
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const dd = Math.floor(h / 24);
  if (dd < 7) return `${dd}d ago`;
  if (dd < 30) return `${Math.floor(dd / 7)}w ago`;
  if (dd < 365) return `${Math.floor(dd / 30)}mo ago`;
  return `${Math.floor(dd / 365)}y ago`;
}

/** "12 Aug 2026, 4:30 pm" */
export function fmtDateTime(d: Date | string): string {
  const t = typeof d === "string" ? new Date(d) : d;
  let h = t.getHours();
  const min = String(t.getMinutes()).padStart(2, "0");
  const ap = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${t.getDate()} ${MON[t.getMonth()]} ${t.getFullYear()}, ${h}:${min} ${ap}`;
}

/** Number of days in a month (0-indexed month). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** Day key for the first of a month. */
export function monthStartKey(year: number, month: number): DayKey {
  return `${year}-${String(month + 1).padStart(2, "0")}-01`;
}

export function monthEndKey(year: number, month: number): DayKey {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(daysInMonth(year, month)).padStart(2, "0")}`;
}

/** Format a day count the way the policy talks about it: 1, 1.5, 12 — never 12.0 */
export function fmtDays(n: number): string {
  const r = Math.round(n * 2) / 2;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

export function pluralDays(n: number): string {
  return `${fmtDays(n)} ${Math.abs(n) === 1 ? "day" : "days"}`;
}
