/**
 * Balances are derived, never stored.
 *
 * A leave balance is the sum of an append-only ledger. That is what makes the number defensible
 * when an employee disputes it six months later: every day added or removed has an entry, a rule
 * id, an actor and a timestamp behind it.
 */

import { dayKey, DayKey, todayKey } from "@/lib/date";
import type { PolicyConfig } from "./config";
import { accruedToDate, annualProRata, EligibilityInput, LeaveYear, roundHalf } from "./leave-year";
import { BALANCE_TYPES, LEAVE_META } from "./types";
import type { LeaveType } from "./types";

export type LedgerEntry = {
  id?: string;
  leaveType: string;
  entryKind: string;
  amount: number;
  effectiveDate: Date | string;
  note?: string;
  ruleId?: string;
  createdAt?: Date | string;
};

export type BalanceSummary = {
  leaveType: LeaveType;
  /** Carried in from last year (§5 SL, §6 PL). */
  opening: number;
  /** Credited this year by quarterly accrual (§7). */
  accrued: number;
  /** Comp-off credits earned (§11). */
  earned: number;
  /** Manual HR corrections. */
  adjusted: number;
  /** Days consumed by approved leave. */
  used: number;
  /** Days returned by cancellation (§16). */
  restored: number;
  /** Days lost to lapse or expiry (§4, §6, §11). */
  lapsed: number;
  /** opening + accrued + earned + adjusted + restored − used − lapsed */
  available: number;
  /** What they will have accrued by year end, pro-rata. */
  entitlementAnnual: number;
  /** Total credits granted so far — the denominator for the balance ring. */
  granted: number;
};

const CREDIT_KINDS = new Set(["OPENING", "ACCRUAL", "COMP_CREDIT", "CANCEL_CREDIT", "ADJUSTMENT", "CONVERSION"]);

export function summariseBalance(
  leaveType: LeaveType,
  entries: LedgerEntry[],
  emp: EligibilityInput,
  ly: LeaveYear,
  cfg: PolicyConfig,
  asOf: DayKey = todayKey(),
): BalanceSummary {
  const mine = entries.filter((e) => e.leaveType === leaveType);
  const sum = (kind: string) =>
    roundHalf(mine.filter((e) => e.entryKind === kind).reduce((s, e) => s + e.amount, 0));

  const opening = sum("OPENING");
  const accrued = sum("ACCRUAL");
  const earned = sum("COMP_CREDIT");
  const adjusted = sum("ADJUSTMENT") + sum("CONVERSION");
  const restored = sum("CANCEL_CREDIT");
  const used = Math.abs(sum("AVAIL"));
  const lapsed = Math.abs(sum("LAPSE"));

  const available = roundHalf(opening + accrued + earned + adjusted + restored - used - lapsed);
  const granted = roundHalf(opening + accrued + earned + adjusted + restored);

  return {
    leaveType,
    opening, accrued, earned, adjusted, restored, used, lapsed,
    available,
    granted,
    entitlementAnnual:
      leaveType === "COMP_OFF"
        ? cfg.compOffMaxPerYear
        : roundHalf(opening + annualProRata(leaveType, emp, ly, cfg)),
  };
}

/** Every balance the dashboard shows, in display order. */
export function summariseAll(
  entries: LedgerEntry[],
  emp: EligibilityInput,
  ly: LeaveYear,
  cfg: PolicyConfig,
  asOf: DayKey = todayKey(),
): BalanceSummary[] {
  return BALANCE_TYPES.map((t) => summariseBalance(t, entries, emp, ly, cfg, asOf));
}

export function findBalance(all: BalanceSummary[], type: LeaveType): BalanceSummary | undefined {
  return all.find((b) => b.leaveType === type);
}

export function availableOf(all: BalanceSummary[], type: LeaveType): number {
  return findBalance(all, type)?.available ?? 0;
}

/**
 * What the quarterly accrual *should* have credited by now, versus what the ledger actually holds.
 * The difference is what `runAccrual` will post — this makes the accrual job idempotent.
 */
export function accrualGap(
  leaveType: LeaveType,
  entries: LedgerEntry[],
  emp: EligibilityInput,
  ly: LeaveYear,
  cfg: PolicyConfig,
  asOf: DayKey = todayKey(),
): number {
  if (!LEAVE_META[leaveType].accrues || leaveType === "COMP_OFF") return 0;
  const expected = accruedToDate(leaveType, emp, ly, cfg, asOf);
  const posted = roundHalf(
    entries
      .filter((e) => e.leaveType === leaveType && e.entryKind === "ACCRUAL")
      .reduce((s, e) => s + e.amount, 0),
  );
  return roundHalf(expected - posted);
}

/** Group ledger entries for the statement view — newest first. */
export function sortLedger(entries: LedgerEntry[]): LedgerEntry[] {
  return [...entries].sort((a, b) => {
    const ad = dayKey(a.effectiveDate);
    const bd = dayKey(b.effectiveDate);
    if (ad !== bd) return ad < bd ? 1 : -1;
    const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bt - at;
  });
}

export const LEDGER_KIND_LABEL: Record<string, string> = {
  OPENING: "Carried forward",
  ACCRUAL: "Quarterly accrual",
  COMP_CREDIT: "Comp-off credited",
  AVAIL: "Leave availed",
  CANCEL_CREDIT: "Cancellation credit",
  LAPSE: "Lapsed",
  ADJUSTMENT: "HR adjustment",
  CONVERSION: "Converted",
};

export function isCredit(kind: string): boolean {
  return CREDIT_KINDS.has(kind);
}
