/**
 * §3 Policy Year and §7 Leave Accrual.
 *
 * The leave year is the financial year (1 Apr → 31 Mar). Entitlement is granted quarterly and
 * pro-rata: each FY quarter credits a quarter of the annual grant, scaled by the fraction of that
 * quarter the employee was actually eligible for the leave type.
 */

import { addDaysKey, dayKey, diffDays, DayKey, fromKey, maxKey, minKey, todayKey } from "@/lib/date";
import type { PolicyConfig } from "./config";
import { annualEntitlement } from "./types";
import type { LeaveType } from "./types";

export type LeaveYear = {
  /** "2026-27" */
  label: string;
  start: DayKey;
  end: DayKey;
  /** Calendar year in which the year starts. */
  startYear: number;
};

export function leaveYearOf(key: DayKey = todayKey(), cfg?: PolicyConfig): LeaveYear {
  const startMonth = cfg?.leaveYearStartMonth ?? 4;
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7));
  const startYear = m >= startMonth ? y : y - 1;
  return buildYear(startYear, startMonth);
}

export function leaveYearFromLabel(label: string, cfg?: PolicyConfig): LeaveYear {
  const startYear = Number(label.slice(0, 4));
  return buildYear(startYear, cfg?.leaveYearStartMonth ?? 4);
}

function buildYear(startYear: number, startMonth: number): LeaveYear {
  const start = `${startYear}-${String(startMonth).padStart(2, "0")}-01`;
  const endMonth = startMonth === 1 ? 12 : startMonth - 1;
  const endYear = startMonth === 1 ? startYear : startYear + 1;
  const lastDay = new Date(Date.UTC(endYear, endMonth, 0)).getUTCDate();
  const end = `${endYear}-${String(endMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const label =
    startMonth === 1
      ? String(startYear)
      : `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
  return { label, start, end, startYear };
}

/** The previous / next leave year. */
export function shiftLeaveYear(ly: LeaveYear, delta: number, cfg?: PolicyConfig): LeaveYear {
  return buildYear(ly.startYear + delta, cfg?.leaveYearStartMonth ?? 4);
}

export function isInLeaveYear(key: DayKey, ly: LeaveYear): boolean {
  return diffDays(ly.start, key) >= 0 && diffDays(key, ly.end) >= 0;
}

// ── quarters ──────────────────────────────────────────────────────────────────

export type Quarter = { index: number; label: string; start: DayKey; end: DayKey };

export function quartersOf(ly: LeaveYear): Quarter[] {
  const out: Quarter[] = [];
  const startYear = Number(ly.start.slice(0, 4));
  const startMonth = Number(ly.start.slice(5, 7));
  for (let q = 0; q < 4; q++) {
    const sM0 = startMonth - 1 + q * 3;
    const sY = startYear + Math.floor(sM0 / 12);
    const sM = (sM0 % 12) + 1;
    const eM0 = sM0 + 2;
    const eY = startYear + Math.floor(eM0 / 12);
    const eM = (eM0 % 12) + 1;
    const lastDay = new Date(Date.UTC(eY, eM, 0)).getUTCDate();
    out.push({
      index: q + 1,
      label: `Q${q + 1}`,
      start: `${sY}-${String(sM).padStart(2, "0")}-01`,
      end: `${eY}-${String(eM).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
    });
  }
  return out;
}

export function currentQuarter(ly: LeaveYear, asOf: DayKey = todayKey()): Quarter {
  const qs = quartersOf(ly);
  return qs.find((q) => diffDays(q.start, asOf) >= 0 && diffDays(asOf, q.end) >= 0) ?? qs[3];
}

// ── eligibility windows ───────────────────────────────────────────────────────

export type EligibilityInput = {
  joinDate: DayKey;
  confirmDate?: DayKey | null;
  lastWorkingDay?: DayKey | null;
  status: string;
};

/**
 * The window during which an employee is eligible to accrue a given leave type.
 * PL is the special case: §7 ACCRUAL.PL_ON_CONFIRM means PL only accrues from the confirmation
 * date, and §6 PL.CONFIRMED_ONLY means probationers have none at all.
 */
export function eligibilityWindow(
  type: LeaveType,
  emp: EligibilityInput,
  ly: LeaveYear,
): { from: DayKey; to: DayKey } | null {
  let from = maxKey(emp.joinDate, ly.start);
  const to = emp.lastWorkingDay ? minKey(emp.lastWorkingDay, ly.end) : ly.end;

  if (type === "PL") {
    if (!emp.confirmDate) return null; // still on probation — no PL at all
    from = maxKey(from, emp.confirmDate);
  }

  if (diffDays(from, to) < 0) return null;
  return { from, to };
}

// ── accrual ───────────────────────────────────────────────────────────────────

export type AccrualLine = {
  quarter: Quarter;
  /** Days of the quarter the employee was eligible. */
  eligibleDays: number;
  quarterDays: number;
  amount: number;
  /** True once the quarter has begun — accrual credits at the *start* of a quarter (§7). */
  credited: boolean;
};

/** Round to the nearest half day — leave is transacted in halves (§14). */
export function roundHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

/**
 * §7 ACCRUAL.QUARTERLY — the per-quarter pro-rata schedule for one leave type.
 * `asOf` decides which quarters have actually been credited.
 */
export function accrualSchedule(
  type: LeaveType,
  emp: EligibilityInput,
  ly: LeaveYear,
  cfg: PolicyConfig,
  asOf: DayKey = todayKey(),
): AccrualLine[] {
  const annual = annualEntitlement(type, cfg);
  const win = eligibilityWindow(type, emp, ly);
  const perQuarter = annual / 4;

  // Rounding is applied to the *cumulative* total rather than to each quarter, so the quarters
  // always sum to the annual grant exactly. Rounding each quarter independently would credit
  // 4 × roundHalf(15/4) = 16 days against an entitlement of 15.
  let exactRunning = 0;
  let roundedRunning = 0;

  return quartersOf(ly).map((quarter) => {
    const quarterDays = diffDays(quarter.start, quarter.end) + 1;
    let eligibleDays = 0;
    if (win) {
      const from = maxKey(win.from, quarter.start);
      const to = minKey(win.to, quarter.end);
      eligibleDays = Math.max(0, diffDays(from, to) + 1);
    }
    exactRunning += (perQuarter * eligibleDays) / quarterDays;
    const cumulative = roundHalf(exactRunning);
    const amount = roundHalf(cumulative - roundedRunning);
    roundedRunning = cumulative;

    return {
      quarter,
      eligibleDays,
      quarterDays,
      amount,
      credited: diffDays(quarter.start, asOf) >= 0,
    };
  });
}

/** Total accrued for a type up to `asOf`, i.e. the sum of quarters already begun. */
export function accruedToDate(
  type: LeaveType,
  emp: EligibilityInput,
  ly: LeaveYear,
  cfg: PolicyConfig,
  asOf: DayKey = todayKey(),
): number {
  return roundHalf(
    accrualSchedule(type, emp, ly, cfg, asOf)
      .filter((l) => l.credited)
      .reduce((s, l) => s + l.amount, 0),
  );
}

/** Full-year pro-rata entitlement — what they will have accrued by 31 March. */
export function annualProRata(
  type: LeaveType,
  emp: EligibilityInput,
  ly: LeaveYear,
  cfg: PolicyConfig,
): number {
  return roundHalf(accrualSchedule(type, emp, ly, cfg, ly.end).reduce((s, l) => s + l.amount, 0));
}

/**
 * §17 EXIT.RECOVERY — days availed beyond pro-rata entitlement at the point of exit, which are
 * recovered in full & final settlement. Applies to CL and PL.
 */
export function excessOnExit(
  type: LeaveType,
  emp: EligibilityInput,
  ly: LeaveYear,
  cfg: PolicyConfig,
  availed: number,
): number {
  if (type !== "CL" && type !== "PL") return 0;
  const lwd = emp.lastWorkingDay ?? todayKey();
  const entitled = accruedToDate(type, emp, ly, cfg, lwd);
  return Math.max(0, roundHalf(availed - entitled));
}

// ── carry forward & lapse ─────────────────────────────────────────────────────

export type CarryForwardResult = {
  type: LeaveType;
  closing: number;
  carried: number;
  lapsed: number;
  ruleId: string;
  note: string;
};

/**
 * Year-end rollover for one type.
 *   CL  — §4 CL.NO_CF / CL.LAPSE: nothing carries, everything lapses.
 *   SL  — §5 SL.CF_UNLIMITED: everything carries.
 *   PL  — §6 PL.CARRY_FWD + PL.CAP_30: carries up to the ceiling, the rest lapses.
 *   COMP_OFF — credits are individually dated and expire on their own clock (§11), never carried.
 */
export function computeCarryForward(
  type: LeaveType,
  closing: number,
  cfg: PolicyConfig,
): CarryForwardResult {
  const c = roundHalf(Math.max(0, closing));
  switch (type) {
    case "SL":
      return { type, closing: c, carried: c, lapsed: 0, ruleId: "SL.CF_UNLIMITED",
        note: "Sick Leave carries forward without limit." };
    case "PL": {
      const carried = Math.min(c, cfg.plAccumulationCap);
      return { type, closing: c, carried, lapsed: roundHalf(c - carried),
        ruleId: carried < c ? "PL.CAP_30" : "PL.CARRY_FWD",
        note: carried < c
          ? `Privileged Leave is capped at ${cfg.plAccumulationCap} days; the balance above the ceiling lapsed.`
          : "Privileged Leave carried forward in full." };
    }
    case "CL":
      return { type, closing: c, carried: 0, lapsed: c, ruleId: "CL.LAPSE",
        note: "Casual Leave does not carry forward and lapses at year end." };
    default:
      return { type, closing: c, carried: 0, lapsed: c, ruleId: "",
        note: "Does not carry forward." };
  }
}

/**
 * §6 PL.CAP_30 applies "at any given time", not only at year end — this checks a live balance
 * against the ceiling so the dashboard can warn before days are actually lost.
 */
export function plCeilingHeadroom(currentPl: number, cfg: PolicyConfig): number {
  return roundHalf(cfg.plAccumulationCap - currentPl);
}

/** Days remaining until CL lapses — drives the "use it or lose it" nudge. */
export function daysUntilYearEnd(ly: LeaveYear, asOf: DayKey = todayKey()): number {
  return diffDays(asOf, ly.end);
}

export function toEligibility(u: {
  joinDate: Date | string;
  confirmDate?: Date | string | null;
  lastWorkingDay?: Date | string | null;
  status: string;
}): EligibilityInput {
  return {
    joinDate: dayKey(u.joinDate),
    confirmDate: u.confirmDate ? dayKey(u.confirmDate) : null,
    lastWorkingDay: u.lastWorkingDay ? dayKey(u.lastWorkingDay) : null,
    status: u.status,
  };
}

export { addDaysKey, fromKey };
