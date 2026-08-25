/**
 * §8 GEN.SANDWICH — the single most consequential computation in LeaveBase.
 *
 * "Where employee avails leave immediately before and immediately after a weekly off or a declared
 *  holiday, the intervening weekly off(s) and/or holiday(s) shall also be treated as part of the
 *  leave period and will be deducted from the employee's eligible leave balance."
 *
 * The rule is evaluated over a *maximal run* of consecutive non-working days. A run is sandwiched
 * when the working day immediately before it and the working day immediately after it are both
 * leave days — and crucially, those neighbouring leave days may belong to a different request, so
 * the evaluation works over the union of this draft and the employee's existing leave.
 */

import { addDaysKey, DayKey, diffDays, eachDayKey, fmtDate, weekdayOf } from "@/lib/date";
import type { DayType, HalfDay, LeaveType } from "./types";

export type HolidayInfo = { date: DayKey; name: string; type: string };

export type CalendarContext = {
  /** 0=Sun … 6=Sat */
  weeklyOffs: number[];
  holidays: Map<DayKey, HolidayInfo>;
  /** Day keys the employee already has leave on (approved or pending), excluding this draft. */
  existingLeaveDays: Set<DayKey>;
  /** Day keys already charged by another request — never charge them twice. */
  alreadyChargedDays: Set<DayKey>;
};

export type DayLine = {
  date: DayKey;
  dayType: DayType;
  charged: number; // 0 | 0.5 | 1
  label: string; // holiday name, "Weekly off", "Working day"
  reason: string; // why it is (or isn't) charged
  /** Outside the requested range, pulled in by the sandwich rule. */
  extension?: boolean;
};

export type Breakdown = {
  lines: DayLine[];
  chargedDays: number;
  calendarDays: number;
  workingDays: number;
  sandwichedDays: number;
  /** Days pulled in from outside the selected range. */
  extensionDays: DayLine[];
  /** Longest run of consecutive charged working days — drives PL notice rules (§6). */
  consecutiveRun: number;
};

export function classifyDay(key: DayKey, ctx: CalendarContext): { type: DayType; label: string } {
  const h = ctx.holidays.get(key);
  if (h) return { type: "HOLIDAY", label: h.name };
  if (ctx.weeklyOffs.includes(weekdayOf(key))) return { type: "WEEKLY_OFF", label: "Weekly off" };
  return { type: "WORKING", label: "Working day" };
}

export function isWorkingDay(key: DayKey, ctx: CalendarContext): boolean {
  return classifyDay(key, ctx).type === "WORKING";
}

/** Working days in an inclusive range — used for absence and coverage maths. */
export function countWorkingDays(start: DayKey, end: DayKey, ctx: CalendarContext): number {
  return eachDayKey(start, end).filter((d) => isWorkingDay(d, ctx)).length;
}

/** The next working day on or after `key`. */
export function nextWorkingDay(key: DayKey, ctx: CalendarContext): DayKey {
  let cur = key;
  for (let i = 0; i < 400; i++) {
    if (isWorkingDay(cur, ctx)) return cur;
    cur = addDaysKey(cur, 1);
  }
  return cur;
}

/**
 * Build the charged-day breakdown for a leave range.
 *
 * `countsAllDays` implements §9 ML.INCLUSIVE — maternity absorbs every calendar day in the block
 * regardless of the sandwich test, because the entitlement is expressed in weeks, not working days.
 */
export function buildBreakdown(opts: {
  start: DayKey;
  end: DayKey;
  leaveType: LeaveType;
  halfDay: HalfDay;
  ctx: CalendarContext;
}): Breakdown {
  const { start, end, leaveType, halfDay, ctx } = opts;
  const countsAllDays = leaveType === "MATERNITY";
  const range = eachDayKey(start, end);
  const rangeSet = new Set(range);

  // The union of this draft and existing leave — the sandwich test reads from this.
  const leaveMap = new Set<DayKey>([...ctx.existingLeaveDays, ...range]);

  const lines: DayLine[] = [];

  // ── days inside the selected range ──────────────────────────────────────────
  for (const date of range) {
    const { type, label } = classifyDay(date, ctx);

    if (type === "WORKING") {
      let charged = 1;
      let reason = "";
      if (halfDay !== "NONE" && start === end) {
        charged = 0.5;
        reason = halfDay === "FIRST_HALF" ? "First four hours (§14)" : "Last four hours (§14)";
      }
      lines.push({ date, dayType: type, charged, label, reason });
      continue;
    }

    // Non-working day inside the range.
    if (countsAllDays) {
      lines.push({
        date, dayType: type, charged: 1, label,
        reason: "Counted as part of maternity leave (§9)",
      });
      continue;
    }

    const sandwiched = isRunSandwiched(date, ctx, leaveMap);
    if (sandwiched && !ctx.alreadyChargedDays.has(date)) {
      lines.push({
        date, dayType: type, charged: 1, label,
        reason: `Falls between leave on either side — deducted under §8`,
      });
    } else {
      lines.push({
        date, dayType: type, charged: 0, label,
        reason: sandwiched ? "Already deducted by another request" : "Not deducted",
      });
    }
  }

  // ── runs adjacent to the range that this request sandwiches ─────────────────
  // e.g. leave ends Friday and an approved leave resumes Monday: the weekend is now sandwiched
  // and §8 charges it. Only the request that *creates* the sandwich pays for it.
  const extensionDays: DayLine[] = [];
  if (!countsAllDays) {
    for (const dir of [-1, 1] as const) {
      const runStart = dir === -1 ? addDaysKey(start, -1) : addDaysKey(end, 1);
      if (isWorkingDay(runStart, ctx)) continue;

      const run: DayKey[] = [];
      let cur = runStart;
      for (let i = 0; i < 30 && !isWorkingDay(cur, ctx); i++) {
        run.push(cur);
        cur = addDaysKey(cur, dir);
      }
      // `cur` is now the working day on the far side of the run.
      if (!leaveMap.has(cur)) continue; // no leave on the far side — not a sandwich
      if (run.some((d) => rangeSet.has(d))) continue; // already handled inside the range

      for (const d of run) {
        if (ctx.alreadyChargedDays.has(d)) continue;
        const { type, label } = classifyDay(d, ctx);
        extensionDays.push({
          date: d, dayType: type, charged: 1, label, extension: true,
          reason: `Bridges this leave and your leave on ${fmtDate(cur)} — deducted under §8`,
        });
      }
    }
  }

  const all = [...lines, ...extensionDays].sort((a, b) => (a.date < b.date ? -1 : 1));
  const chargedDays = round2(all.reduce((s, l) => s + l.charged, 0));

  return {
    lines: all,
    chargedDays,
    calendarDays: range.length,
    workingDays: lines.filter((l) => l.dayType === "WORKING").length,
    sandwichedDays: all.filter((l) => l.dayType !== "WORKING" && l.charged > 0).length,
    extensionDays,
    consecutiveRun: longestChargedRun(all),
  };
}

/**
 * Is the maximal non-working run containing `date` bounded by leave on both sides?
 */
function isRunSandwiched(date: DayKey, ctx: CalendarContext, leaveMap: Set<DayKey>): boolean {
  let before = addDaysKey(date, -1);
  for (let i = 0; i < 30 && !isWorkingDay(before, ctx); i++) before = addDaysKey(before, -1);
  let after = addDaysKey(date, 1);
  for (let i = 0; i < 30 && !isWorkingDay(after, ctx); i++) after = addDaysKey(after, 1);
  return leaveMap.has(before) && leaveMap.has(after);
}

/**
 * The longest run of consecutive charged days. §6 measures notice against "consecutive PLs", and
 * because §6 PL.INTERVENING folds holidays into PL, the run is measured over charged days rather
 * than working days.
 */
function longestChargedRun(lines: DayLine[]): number {
  let best = 0;
  let cur = 0;
  let prev: DayKey | null = null;
  for (const l of lines) {
    if (l.charged <= 0) { cur = 0; prev = l.date; continue; }
    cur = prev && diffDays(prev, l.date) === 1 ? cur + 1 : 1;
    best = Math.max(best, cur);
    prev = l.date;
  }
  return best;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Build a calendar context from raw rows. */
export function makeContext(opts: {
  weeklyOffs: number[];
  holidays: { date: Date | string; name: string; type: string }[];
  existingLeaveDays?: Iterable<DayKey>;
  alreadyChargedDays?: Iterable<DayKey>;
}): CalendarContext {
  const holidays = new Map<DayKey, HolidayInfo>();
  for (const h of opts.holidays) {
    const key = typeof h.date === "string" ? h.date.slice(0, 10) : h.date.toISOString().slice(0, 10);
    holidays.set(key, { date: key, name: h.name, type: h.type });
  }
  return {
    weeklyOffs: opts.weeklyOffs,
    holidays,
    existingLeaveDays: new Set(opts.existingLeaveDays ?? []),
    alreadyChargedDays: new Set(opts.alreadyChargedDays ?? []),
  };
}
