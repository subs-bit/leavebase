import "server-only";

import { db } from "@/lib/db";
import { dayKey, DayKey, fmtDate, fromKey, todayKey } from "@/lib/date";
import { accrualGap } from "@/lib/policy/balance";
import type { PolicyConfig } from "@/lib/policy/config";
import {
  accrualSchedule, computeCarryForward, currentAccrualPeriod, leaveYearOf, shiftLeaveYear,
  toEligibility,
} from "@/lib/policy/leave-year";
import { LEAVE_META } from "@/lib/policy/types";
import type { LeaveType } from "@/lib/policy/types";
import { getPolicy } from "./context";
import { audit, notify } from "./activity";
import { expireCompOffs } from "./leave";

const ACCRUING: LeaveType[] = ["CL", "SL", "PL"];

/**
 * §7 — post any accrual the ledger is missing, on whichever cadence the studio has chosen
 * (Settings → Policy values → When leave is credited): quarterly as the policy states, or the
 * whole pro-rata entitlement in one lump the moment someone becomes eligible.
 *
 * Idempotent by construction: it compares what *should* have accrued by `asOf` against what the
 * ledger already holds and posts only the difference. Running it twice in a day is a no-op, which
 * is what lets it be called on every sign-in rather than depending on a scheduler. Switching
 * cadence down (e.g. "all at once" back to quarterly) can leave the ledger holding more than
 * quarterly-to-date now says is owed — the difference is corrected on the next run too, capped so
 * it only ever claws back an unused surplus, never leave that's already been approved (see
 * `accrualGap`).
 */
export async function runAccrual(
  opts: { userId?: string; asOf?: DayKey } = {},
): Promise<{ posted: number; users: number }> {
  const asOf = opts.asOf ?? todayKey();
  const cfg = await getPolicy();
  const ly = leaveYearOf(asOf, cfg);

  const users = await db.user.findMany({
    // Founders are outside the policy — no entitlement accrues to them (see isFounder).
    where: { isActive: true, role: { not: "FOUNDER" }, ...(opts.userId ? { id: opts.userId } : {}) },
    select: {
      id: true, name: true, joinDate: true, confirmDate: true, lastWorkingDay: true, status: true,
    },
  });

  const period = currentAccrualPeriod(ly, cfg, asOf);
  const cadenceRuleId = cfg.accrualCadence === "ANNUAL" ? "ACCRUAL.ANNUAL" : "ACCRUAL.QUARTERLY";
  let posted = 0;
  let touched = 0;

  for (const u of users) {
    const emp = toEligibility(u);
    const entries = await db.leaveLedger.findMany({
      where: { userId: u.id, leaveYear: ly.label },
      select: { leaveType: true, entryKind: true, amount: true, effectiveDate: true },
    });

    let userPosted = false;
    for (const type of ACCRUING) {
      const gap = accrualGap(type, entries, emp, ly, cfg, asOf);
      if (gap === 0) continue;

      await db.leaveLedger.create({
        data: {
          userId: u.id,
          leaveYear: ly.label,
          leaveType: type,
          entryKind: "ACCRUAL",
          amount: gap,
          effectiveDate: fromKey(period.start),
          ruleId:
            gap < 0
              ? "ACCRUAL.CADENCE_CORRECTION"
              : type === "PL" && u.confirmDate
                ? "ACCRUAL.PL_ON_CONFIRM"
                : cadenceRuleId,
          note:
            gap < 0
              ? `Cadence switched back to quarterly — correcting the over-credited balance from "all at once" (§7)`
              : `${period.label} ${ly.label} pro-rata credit`,
        },
      });
      posted++;
      userPosted = true;
    }
    if (userPosted) touched++;
  }

  await expireCompOffs(asOf);
  return { posted, users: touched };
}

/**
 * Year-end rollover: close the old year's balances, lapse what must lapse (§4 CL, §6 PL ceiling),
 * and post the opening balance for the new year (§5 SL, §6 PL).
 */
export async function runYearEndRollover(
  intoYearStart: DayKey,
  actorId?: string,
): Promise<{ rolled: number; lapsed: number }> {
  const cfg = await getPolicy();
  const newYear = leaveYearOf(intoYearStart, cfg);
  const oldYear = shiftLeaveYear(newYear, -1, cfg);

  const users = await db.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, joinDate: true, confirmDate: true, lastWorkingDay: true, status: true },
  });

  let rolled = 0;
  let lapsedTotal = 0;

  for (const u of users) {
    const alreadyOpened = await db.leaveLedger.findFirst({
      where: { userId: u.id, leaveYear: newYear.label, entryKind: "OPENING" },
    });
    if (alreadyOpened) continue;

    const entries = await db.leaveLedger.findMany({
      where: { userId: u.id, leaveYear: oldYear.label },
    });
    if (entries.length === 0) continue;

    const emp = toEligibility(u);
    const { summariseBalance } = await import("@/lib/policy/balance");

    for (const type of ACCRUING) {
      const bal = summariseBalance(type, entries, emp, oldYear, cfg, oldYear.end);
      const result = computeCarryForward(type, bal.available, cfg);

      if (result.lapsed > 0) {
        await db.leaveLedger.create({
          data: {
            userId: u.id, leaveYear: oldYear.label, leaveType: type,
            entryKind: "LAPSE", amount: -result.lapsed,
            effectiveDate: fromKey(oldYear.end), actorId,
            ruleId: result.ruleId, note: result.note,
          },
        });
        lapsedTotal += result.lapsed;
      }
      if (result.carried > 0) {
        await db.leaveLedger.create({
          data: {
            userId: u.id, leaveYear: newYear.label, leaveType: type,
            entryKind: "OPENING", amount: result.carried,
            effectiveDate: fromKey(newYear.start), actorId,
            ruleId: result.ruleId,
            note: `Carried forward from ${oldYear.label}`,
          },
        });
      }
    }
    rolled++;
  }

  await audit({
    actorId,
    action: "YEAR_ROLLOVER",
    entity: "LeaveLedger",
    summary: `Rolled ${rolled} employees from ${oldYear.label} into ${newYear.label}; ${lapsedTotal} days lapsed`,
  });

  return { rolled, lapsed: lapsedTotal };
}

/**
 * §12 — detect runs of unauthorised absence.
 *
 * Absence is *recorded*, never inferred. LeaveBase has no attendance feed, and "a working day with
 * no leave on it" describes everyone who simply came to work — so the only sound signal is an
 * unauthorised-absence record raised by a manager or HR (see `recordUnauthorisedAbsence`). This
 * scans those records for consecutive working-day runs, warning at `absenceWarningDays` and
 * escalating to an absconding flag at `abscondingDays`.
 *
 * It never terminates anyone. §12 says absconding "will result in automatic termination"; that is
 * a decision for a human with the full picture, so the system raises the flag and records it.
 */
export async function detectAbsence(
  asOf: DayKey = todayKey(),
): Promise<{ flagged: number }> {
  const cfg = await getPolicy();
  const { getCalendarContext } = await import("./context");
  const { isWorkingDay } = await import("@/lib/policy/calendar");
  const { addDaysKey } = await import("@/lib/date");

  const lookback = 120;

  // Every recorded unauthorised-absence day in the window, grouped by employee.
  const absenceDays = await db.leaveRequestDay.findMany({
    where: {
      date: { gte: fromKey(addDaysKey(asOf, -lookback)), lt: fromKey(asOf) },
      request: { leaveType: "LOP", status: "APPROVED", user: { isActive: true } },
    },
    include: { request: { select: { userId: true, user: { select: { name: true } } } } },
    orderBy: { date: "asc" },
  });

  const byUser = new Map<string, { name: string; days: DayKey[] }>();
  for (const d of absenceDays) {
    const uid = d.request.userId;
    if (!byUser.has(uid)) byUser.set(uid, { name: d.request.user.name, days: [] });
    byUser.get(uid)!.days.push(dayKey(d.date));
  }

  let flagged = 0;

  for (const [userId, rec] of byUser) {
    const ctx = await getCalendarContext(userId, cfg);
    const marked = new Set(rec.days);

    // Collapse marked days into runs. A weekly off or holiday between two marked days does not
    // break the run — the employee is still absent across it. An unmarked *working* day does.
    const runs: DayKey[][] = [];
    let current: DayKey[] = [];
    let cursor: DayKey | null = null;

    for (const day of [...marked].sort()) {
      if (cursor) {
        let broken = false;
        for (let probe = addDaysKey(cursor, 1); probe < day; probe = addDaysKey(probe, 1)) {
          if (isWorkingDay(probe, ctx) && !marked.has(probe)) {
            broken = true;
            break;
          }
        }
        if (broken) {
          runs.push(current);
          current = [];
        }
      }
      current.push(day);
      cursor = day;
    }
    if (current.length > 0) runs.push(current);

    for (const run of runs) {
      const workingDays = run.filter((d) => isWorkingDay(d, ctx)).length;
      if (workingDays < cfg.absenceWarningDays) continue;

      const severity = workingDays >= cfg.abscondingDays ? "ABSCONDING" : "WARNING";
      const fromDate = run[0];
      const toDate = run[run.length - 1];

      const existing = await db.absenceFlag.findFirst({
        where: { userId, fromDate: fromKey(fromDate) },
      });
      if (existing) {
        if (
          existing.status === "OPEN" &&
          (existing.severity !== severity || existing.workingDays !== workingDays)
        ) {
          await db.absenceFlag.update({
            where: { id: existing.id },
            data: { severity, workingDays, toDate: fromKey(toDate) },
          });
        }
        continue;
      }

      await db.absenceFlag.create({
        data: {
          userId,
          fromDate: fromKey(fromDate),
          toDate: fromKey(toDate),
          workingDays,
          severity,
          note:
            severity === "ABSCONDING"
              ? `${workingDays} consecutive working days of recorded unauthorised absence. Section 12 treats ${cfg.abscondingDays} or more as absconding — the decision rests with HR, not the system.`
              : `${workingDays} consecutive working days of recorded unauthorised absence. The absconding threshold under section 12 is ${cfg.abscondingDays}.`,
        },
      });
      flagged++;

      const hrUsers = await db.user.findMany({
        where: { role: { in: ["HR", "ADMIN"] }, isActive: true },
        select: { id: true },
      });
      for (const hr of hrUsers) {
        await notify({
          userId: hr.id,
          kind: "ABSENCE_FLAG",
          title:
            severity === "ABSCONDING"
              ? `${rec.name} — absconding threshold reached`
              : `${rec.name} — unauthorised absence`,
          body: `${workingDays} working days from ${fmtDate(fromDate)} to ${fmtDate(toDate)}.`,
          link: `/employees/${userId}`,
        });
      }
    }
  }

  return { flagged };
}

/**
 * §12/§13 — record that an employee was absent without approval.
 *
 * This is the input the absconding detector reads, and it produces the Loss of Pay record payroll
 * needs. It draws no leave balance: LOP is unpaid by definition (§13 LOP.NO_PAY).
 */
export async function recordUnauthorisedAbsence(opts: {
  userId: string;
  from: DayKey;
  to: DayKey;
  note: string;
  actorId: string;
}): Promise<{ ok: true; requestId: string; days: number } | { ok: false; error: string }> {
  const { userId, from, to, note, actorId } = opts;
  const cfg = await getPolicy();
  const { getCalendarContext } = await import("./context");
  const { buildBreakdown } = await import("@/lib/policy/calendar");
  const { diffDays } = await import("@/lib/date");

  if (diffDays(from, to) < 0) return { ok: false, error: "The end date is before the start date." };
  if (diffDays(to, todayKey()) < 0) {
    return { ok: false, error: "Absence can only be recorded for days that have already passed." };
  }
  if (!note.trim()) return { ok: false, error: "Record what happened." };

  const ctx = await getCalendarContext(userId, cfg);
  const breakdown = buildBreakdown({ start: from, end: to, leaveType: "LOP", halfDay: "NONE", ctx });

  // Unauthorised absence charges working days only. §8's intervening-days rule governs leave
  // "deducted from the employee's eligible leave balance" — Loss of Pay draws no balance, so a
  // holiday or weekly off inside the run is not a day of pay to withhold.
  const lines = breakdown.lines.map((l) =>
    l.dayType === "WORKING"
      ? l
      : { ...l, charged: 0, reason: `${l.label} — not a working day, no pay withheld` },
  );
  const chargedDays = lines.reduce((sum, l) => sum + l.charged, 0);

  if (chargedDays <= 0) {
    return { ok: false, error: "Those dates contain no working days." };
  }

  const overlap = await db.leaveRequestDay.findFirst({
    where: {
      charged: { gt: 0 },
      date: { gte: fromKey(from), lte: fromKey(to) },
      request: { userId, status: { in: ["PENDING", "PENDING_HOD", "APPROVED"] } },
    },
  });
  if (overlap) {
    return {
      ok: false,
      error: "Some of those days already have leave on record. Cancel that leave first.",
    };
  }

  const count = await db.leaveRequest.count();
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } });

  const request = await db.leaveRequest.create({
    data: {
      code: `AB-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`,
      userId,
      leaveType: "LOP",
      startDate: fromKey(from),
      endDate: fromKey(to),
      halfDay: "NONE",
      chargedDays,
      calendarDays: breakdown.calendarDays,
      reason: note.trim(),
      status: "APPROVED",
      decidedAt: new Date(),
      noticeDays: 0,
      isLop: true,
      lopDays: chargedDays,
      policySnapshot: JSON.stringify({ recordedBy: actorId, ruleId: "ABS.LWP" }),
      days: {
        create: lines.map((l) => ({
          date: fromKey(l.date),
          dayType: l.dayType,
          charged: l.charged,
          reason: l.reason,
          label: l.label,
        })),
      },
    },
  });

  await audit({
    actorId,
    action: "ABSENCE_RECORDED",
    entity: "LeaveRequest",
    entityId: request.id,
    summary: `Recorded unauthorised absence for ${user.name} — ${from} to ${to}, ${chargedDays} working day(s) Loss of Pay under section 13`,
  });
  await notify({
    userId,
    kind: "ABSENCE_FLAG",
    title: "Unauthorised absence recorded",
    body: `${fmtDate(from)}${from === to ? "" : ` to ${fmtDate(to)}`} has been recorded as absence without approval and is unpaid under §13. Speak to HR if this is wrong.`,
    link: "/requests",
  });

  await detectAbsence();

  return { ok: true, requestId: request.id, days: chargedDays };
}

/** Everything that should happen on a schedule, run opportunistically on sign-in. */
export async function runMaintenance(userId?: string): Promise<void> {
  try {
    await runAccrual(userId ? { userId } : {});
  } catch {
    // Maintenance must never block a page render.
  }
}

export { LEAVE_META };
export type { PolicyConfig };
