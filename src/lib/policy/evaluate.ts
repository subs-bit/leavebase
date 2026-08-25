/**
 * The rule engine.
 *
 * One pure function takes a draft request and everything it could possibly need to judge it, and
 * returns findings. Nothing here touches the database, which is what makes it usable identically
 * in the live application form (as the user types) and on the server at submission time — the
 * user never sees a preview that the server then contradicts.
 *
 * Every finding carries the rule id and the clause, so the UI can always answer "says who?".
 */

import { addDaysKey, DayKey, diffDays, fmtDate, fmtDays, pluralDays, todayKey } from "@/lib/date";
import { buildBreakdown, Breakdown, CalendarContext, isWorkingDay } from "./calendar";
import type { PolicyConfig } from "./config";
import { EligibilityInput, LeaveYear, leaveYearOf, plCeilingHeadroom, roundHalf } from "./leave-year";
import { buildRouting, RoutingPerson, RoutingStep } from "./routing";
import { LEAVE_META, NON_CLUBBABLE } from "./types";
import type { HalfDay, LeaveType } from "./types";
import type { BalanceSummary } from "./balance";

export type FindingLevel = "BLOCK" | "WARN" | "INFO";

export type Finding = {
  level: FindingLevel;
  ruleId: string;
  clause: string;
  title: string;
  detail: string;
};

export type EvalEmployee = EligibilityInput & {
  id: string;
  name: string;
  role: string;
  gender: string;
  employmentType: string;
  isActive: boolean;
};

export type ExistingRequest = {
  id: string;
  leaveType: string;
  status: string;
  start: DayKey;
  end: DayKey;
  /** Charged day keys, so overlap and clubbing tests are exact. */
  days: DayKey[];
};

export type TeamConflict = { date: DayKey; names: string[] };

export type EvalInput = {
  employee: EvalEmployee;
  leaveType: LeaveType;
  start: DayKey;
  end: DayKey;
  halfDay: HalfDay;
  hasMedicalDoc?: boolean;
  expectedDelivery?: DayKey | null;
  maternityPattern?: "SPLIT_8_18" | "POST_26" | null;
  cfg: PolicyConfig;
  ctx: CalendarContext;
  balances: BalanceSummary[];
  existing: ExistingRequest[];
  /** Approved, unexpired comp-off credits available to spend. */
  compOffAvailable?: number;
  compOffUsedThisYear?: number;
  teamConflicts?: TeamConflict[];
  manager?: RoutingPerson;
  hod?: RoutingPerson;
  hr?: RoutingPerson;
  today?: DayKey;
};

export type Evaluation = {
  ok: boolean;
  findings: Finding[];
  breakdown: Breakdown;
  chargedDays: number;
  /** Days that will be unpaid because balance is short (§13 LOP.NO_BALANCE). */
  lopDays: number;
  availableBefore: number;
  availableAfter: number;
  noticeDays: number;
  routing: RoutingStep[];
  requiresMedicalDoc: boolean;
  /** §5 SL.DOC_FAILURE — will be charged to PL instead of SL. */
  convertsToPl: boolean;
  leaveYear: LeaveYear;
};

const EMPTY_BREAKDOWN: Breakdown = {
  lines: [], chargedDays: 0, calendarDays: 0, workingDays: 0,
  sandwichedDays: 0, extensionDays: [], consecutiveRun: 0,
};

export function evaluateRequest(input: EvalInput): Evaluation {
  const {
    employee: emp, leaveType, start, end, halfDay, cfg, ctx, balances, existing,
  } = input;
  const today = input.today ?? todayKey();
  const meta = LEAVE_META[leaveType];
  const findings: Finding[] = [];
  const add = (level: FindingLevel, ruleId: string, clause: string, title: string, detail: string) =>
    findings.push({ level, ruleId, clause, title, detail });

  const ly = leaveYearOf(start, cfg);

  // ── structural sanity ───────────────────────────────────────────────────────
  if (diffDays(start, end) < 0) {
    add("BLOCK", "INPUT.RANGE", "", "The end date is before the start date",
      "Pick an end date on or after the start date.");
    return fail(findings, ly, input, today);
  }
  if (diffDays(start, end) > 400) {
    add("BLOCK", "INPUT.RANGE", "", "That range is too long",
      "A single request cannot span more than 400 days.");
    return fail(findings, ly, input, today);
  }

  // §2 SCOPE.PAYROLL
  if (!emp.isActive || emp.status === "EXITED") {
    add("BLOCK", "SCOPE.PAYROLL", "§2", "This account cannot apply for leave",
      "Leave applies to employees on the direct payroll of Prismix Studios. This account is no longer active.");
  }

  // Balances are held per leave year, so a request cannot straddle 31 March.
  const endYear = leaveYearOf(end, cfg);
  if (endYear.label !== ly.label) {
    add("BLOCK", "YEAR.FY", "§3",
      "This leave crosses the leave year",
      `The leave year runs 1 April to 31 March, and balances are held per year. Split this into one request ending ${fmtDate(ly.end)} and another starting ${fmtDate(endYear.start)}.`);
    return fail(findings, ly, input, today);
  }

  // ── the day-by-day breakdown ────────────────────────────────────────────────
  const breakdown = buildBreakdown({ start, end, leaveType, halfDay, ctx });
  const chargedDays = breakdown.chargedDays;
  const noticeDays = diffDays(today, start);

  // §14 HALF.WINDOW
  if (halfDay !== "NONE") {
    if (start !== end) {
      add("BLOCK", "HALF.WINDOW", "§14", "Half-days apply to a single day only",
        "A half-day is either the first four hours or the last four hours of one workday. For a longer absence, apply for full days.");
    } else if (!isWorkingDay(start, ctx)) {
      add("BLOCK", "HALF.WINDOW", "§14", "That day isn't a working day",
        "A half-day can only be taken on a working day.");
    } else if (!meta.halfDayAllowed) {
      add("BLOCK", "HALF.WINDOW", "§14", `${meta.name} cannot be taken as a half-day`,
        `${meta.name} is granted in whole days.`);
    }
  }

  if (chargedDays <= 0 && findings.every((f) => f.level !== "BLOCK")) {
    add("BLOCK", "INPUT.NO_DAYS", "", "These dates don't consume any leave",
      "Every day you've selected is a weekly off or a declared holiday, and none of them fall between other leave. There's nothing to apply for.");
  }

  // ── §8 sandwich disclosure ──────────────────────────────────────────────────
  if (breakdown.sandwichedDays > 0) {
    const days = breakdown.lines.filter((l) => l.dayType !== "WORKING" && l.charged > 0);
    add("INFO", "GEN.SANDWICH", "§8",
      `${pluralDays(days.length)} of holidays or weekly offs will be deducted`,
      `Because you're on leave immediately before and after ${days.length === 1 ? "it" : "them"}, ${days.map((d) => fmtDate(d.date)).join(", ")} ${days.length === 1 ? "counts" : "count"} as part of this leave.`);
  }
  if (breakdown.extensionDays.length > 0) {
    add("WARN", "GEN.SANDWICH", "§8",
      `${pluralDays(breakdown.extensionDays.length)} outside your selected dates will also be deducted`,
      `${breakdown.extensionDays.map((d) => fmtDate(d.date)).join(", ")} now ${breakdown.extensionDays.length === 1 ? "sits" : "sit"} between this leave and other leave you already have, so §8 charges ${breakdown.extensionDays.length === 1 ? "it" : "them"} to this request.`);
  }

  // ── overlap with existing requests ──────────────────────────────────────────
  const liveRequests = existing.filter((r) => ["PENDING", "PENDING_HOD", "APPROVED"].includes(r.status));
  const draftDays = new Set(breakdown.lines.map((l) => l.date));
  for (const r of liveRequests) {
    const clash = r.days.filter((d) => draftDays.has(d));
    if (clash.length > 0) {
      add("BLOCK", "INPUT.OVERLAP", "",
        "You already have leave on these dates",
        `${clash.slice(0, 3).map(fmtDate).join(", ")}${clash.length > 3 ? ` and ${clash.length - 3} more` : ""} ${clash.length === 1 ? "is" : "are"} already covered by ${r.leaveType} request that is ${r.status.toLowerCase().replace("_", " ")}.`);
      break;
    }
  }

  // ── §8 GEN.NO_CLUBBING ──────────────────────────────────────────────────────
  if (NON_CLUBBABLE.includes(leaveType)) {
    const neighbour = findContiguousDifferentType(start, end, leaveType, liveRequests, ctx);
    if (neighbour) {
      add("BLOCK", "GEN.NO_CLUBBING", "§8",
        "Sick, Casual and Privileged Leave cannot be clubbed",
        `This runs straight into your ${LEAVE_META[neighbour.leaveType as LeaveType]?.name ?? neighbour.leaveType} on ${fmtDate(neighbour.start)}–${fmtDate(neighbour.end)}. Leave a working day between them, or apply for a single type across the whole period.`);
    }
  }

  // ── type-specific rules ─────────────────────────────────────────────────────
  switch (leaveType) {
    case "PL": {
      // §6 PL.CONFIRMED_ONLY
      if (!emp.confirmDate || emp.status === "PROBATION") {
        add("BLOCK", "PL.CONFIRMED_ONLY", "§6", "Privileged Leave starts after confirmation",
          "Employees on probation aren't entitled to Privileged Leave. Casual and Sick Leave are available to you now.");
        break;
      }
      // §6 PL.NOTICE_15 / PL.NOTICE_30
      const run = breakdown.consecutiveRun;
      const longRun = run > cfg.plShortRunMax;
      const required = longRun ? cfg.plNoticeLong : cfg.plNoticeShort;
      if (noticeDays < required) {
        add("BLOCK", longRun ? "PL.NOTICE_30" : "PL.NOTICE_15", "§6",
          `This needs ${required} days' notice`,
          longRun
            ? `More than ${cfg.plShortRunMax} consecutive days of Privileged Leave must be applied for at least ${cfg.plNoticeLong} days in advance. You're applying ${noticeDays < 0 ? `${Math.abs(noticeDays)} days after it starts` : `${noticeDays} day${noticeDays === 1 ? "" : "s"} ahead`} — the earliest start date that qualifies is ${fmtDate(addDaysKey(today, required))}.`
            : `Up to ${cfg.plShortRunMax} consecutive days of Privileged Leave must be applied for at least ${cfg.plNoticeShort} days in advance. You're applying ${noticeDays < 0 ? `${Math.abs(noticeDays)} days after it starts` : `${noticeDays} day${noticeDays === 1 ? "" : "s"} ahead`} — the earliest start date that qualifies is ${fmtDate(addDaysKey(today, required))}.`);
      }
      if (longRun) {
        add("INFO", "PL.DUAL_APPROVAL", "§6", "Head of Department approval needed",
          `Runs of more than ${cfg.plShortRunMax} consecutive days need your reporting manager and the head of department to approve.`);
      }
      break;
    }

    case "SL": {
      const run = breakdown.consecutiveRun;
      if (run > cfg.slMedicalDocAfter) {
        if (input.hasMedicalDoc) {
          add("INFO", "SL.MEDICAL_DOC", "§5", "Medical documents required",
            `More than ${cfg.slMedicalDocAfter} consecutive sick days need medical documents submitted to HR. You've confirmed you're providing them.`);
        } else {
          add("WARN", "SL.DOC_FAILURE", "§5",
            "Without medical documents this will be deducted from Privileged Leave",
            `${run} consecutive sick days need medical documents submitted to HR. If they aren't provided, §5 deducts this leave from your Privileged Leave instead of Sick Leave.`);
        }
      }
      if (noticeDays < 0) {
        add("INFO", "SL.NO_PRIOR_APPROVAL", "§15", "Applied retrospectively",
          "Sick Leave is the one type that doesn't need prior approval, so a past date is fine here.");
      }
      break;
    }

    case "CL": {
      if (breakdown.consecutiveRun > cfg.clLongRunNudge) {
        add("WARN", "CL.PURPOSE", "§4", "Casual Leave isn't meant for long breaks",
          `§4 describes Casual Leave as being for casual, general or unforeseen situations rather than long vacations. For ${breakdown.consecutiveRun} consecutive days, Privileged Leave is the right type.`);
      }
      break;
    }

    case "MATERNITY": {
      if (emp.gender !== "FEMALE") {
        add("BLOCK", "ML.ELIGIBLE", "§9", "Maternity leave is for female employees",
          "If your record has the wrong gender on it, HR can correct it.");
      }
      if (noticeDays < cfg.maternityNoticeDays) {
        add("WARN", "ML.NOTICE_90", "§9", `HR needs ${cfg.maternityNoticeDays} days' written notice`,
          `§9 asks that HR be informed in writing at least three months before you proceed on leave. You're applying ${noticeDays} days ahead — HR will still process this, but flag it with them directly.`);
      }
      if (!input.expectedDelivery) {
        add("BLOCK", "ML.MEDICAL_CERT", "§9", "Expected date of childbirth is required",
          "§9 requires a medical certificate stating the expected date of childbirth.");
      }
      const weeks = breakdown.calendarDays / 7;
      if (weeks > cfg.maternityTotalWeeks + 0.01) {
        add("BLOCK", "ML.SPLIT", "§9", `Maternity leave is capped at ${cfg.maternityTotalWeeks} weeks`,
          `You've selected ${weeks.toFixed(1)} weeks. The entitlement is up to ${cfg.maternityPreWeeks} weeks before delivery plus ${cfg.maternityPostWeeks} weeks after, or the whole ${cfg.maternityTotalWeeks} weeks after delivery.`);
      }
      if (input.expectedDelivery) {
        const pre = Math.max(0, diffDays(start, input.expectedDelivery)) / 7;
        if (input.maternityPattern === "SPLIT_8_18" && pre > cfg.maternityPreWeeks + 0.01) {
          add("BLOCK", "ML.SPLIT", "§9", `At most ${cfg.maternityPreWeeks} weeks can be taken before delivery`,
            `You've selected ${pre.toFixed(1)} weeks before the expected date of ${fmtDate(input.expectedDelivery)}.`);
        }
      }
      add("INFO", "ML.INCLUSIVE", "§9", "Weekly offs and holidays are included",
        "Every calendar day in this period counts as maternity leave, including weekends and declared holidays.");
      break;
    }

    case "PATERNITY": {
      if (emp.gender === "FEMALE") {
        add("BLOCK", "PAT.ENTITLE", "§10", "Paternity leave is for biological fathers",
          "If your record has the wrong gender on it, HR can correct it.");
      }
      if (chargedDays > cfg.paternityDays) {
        add("BLOCK", "PAT.ENTITLE", "§10", `Paternity leave is ${cfg.paternityDays} days`,
          `You've selected ${fmtDays(chargedDays)} days.`);
      }
      break;
    }

    case "COMP_OFF": {
      const avail = input.compOffAvailable ?? 0;
      if (avail < chargedDays) {
        add("BLOCK", "CO.CLAIM_FIRST", "§11", "You don't have enough comp-off credits",
          avail === 0
            ? "Comp-off is earned by working a holiday or weekly off with prior approval from your reporting manager. Raise a comp-off claim first."
            : `You have ${pluralDays(avail)} of approved comp-off credit and this request needs ${pluralDays(chargedDays)}.`);
      }
      const used = input.compOffUsedThisYear ?? 0;
      if (used + chargedDays > cfg.compOffMaxPerYear) {
        add("BLOCK", "CO.MAX_15", "§11", `Comp-off is capped at ${cfg.compOffMaxPerYear} days a year`,
          `You've availed ${pluralDays(used)} this leave year.`);
      }
      break;
    }
  }

  // ── §15 PROC.ADVANCE ────────────────────────────────────────────────────────
  if (!meta.retrospective && noticeDays < 0 && leaveType !== "MATERNITY") {
    add("BLOCK", "PROC.ADVANCE", "§15", `${meta.name} must be applied for in advance`,
      `§15 requires prior approval for every type except Sick Leave. ${fmtDate(start)} has already passed — an absence that wasn't applied for and approved is treated as unauthorised and results in Loss of Pay (§13). Speak to HR if this was an emergency.`);
  }

  // ── §17 exit rules ──────────────────────────────────────────────────────────
  let beforeLastWorkingDay = false;
  if (emp.status === "RESIGNED" && emp.lastWorkingDay) {
    if (diffDays(emp.lastWorkingDay, end) > 0) {
      add("BLOCK", "EXIT.LWD_APPROVAL", "§17", "This runs past your last working day",
        `Your last working day is ${fmtDate(emp.lastWorkingDay)}.`);
    } else {
      beforeLastWorkingDay = true;
      add("INFO", "EXIT.LWD_APPROVAL", "§17", "Needs manager and department head approval",
        "While serving notice, leave before the last working day needs prior approval from both your reporting manager and the head of department.");
      add("INFO", "EXIT.NOTICE_ADJUST", "§17", "Leave is not adjusted against notice period",
        "Leave cannot be set against the notice period unless the head of department, head of HR and the CEO all approve it.");
    }
  }

  // ── balance ─────────────────────────────────────────────────────────────────
  const balanceType: LeaveType = leaveType;
  const bal = balances.find((b) => b.leaveType === balanceType);
  const availableBefore = leaveType === "COMP_OFF"
    ? (input.compOffAvailable ?? 0)
    : (bal?.available ?? 0);

  let lopDays = 0;
  if (meta.accrues) {
    const shortfall = roundHalf(chargedDays - availableBefore);
    if (shortfall > 0) {
      lopDays = shortfall;
      add("WARN", "LOP.NO_BALANCE", "§13",
        `${pluralDays(shortfall)} of this will be unpaid`,
        `You have ${pluralDays(availableBefore)} of ${LEAVE_META[balanceType].name} and this request needs ${pluralDays(chargedDays)}. §13 treats approved leave taken without available balance as Loss of Pay — you won't be paid or receive allowances for ${shortfall === 1 ? "that day" : "those days"}.`);
    }
  }

  const availableAfter = roundHalf(availableBefore - (chargedDays - lopDays));

  // §6 PL.CAP_30 headroom notice
  if (leaveType === "PL" && bal) {
    const headroom = plCeilingHeadroom(bal.available, cfg);
    if (headroom <= 3 && headroom >= 0) {
      add("INFO", "PL.CAP_30", "§6", "You're close to the Privileged Leave ceiling",
        `Privileged Leave can't accumulate beyond ${cfg.plAccumulationCap} days — anything above that lapses. You're ${pluralDays(headroom)} from the ceiling, so taking leave now protects days you'd otherwise lose.`);
    }
  }

  // ── §18 MGR.COVERAGE ────────────────────────────────────────────────────────
  const conflicts = (input.teamConflicts ?? []).filter((c) => draftDays.has(c.date));
  const worst = conflicts.reduce<TeamConflict | null>(
    (a, c) => (!a || c.names.length > a.names.length ? c : a), null);
  if (worst && worst.names.length >= cfg.maxConcurrentPerTeam) {
    add("WARN", "MGR.COVERAGE", "§18", "Your team is thin on these dates",
      `${worst.names.slice(0, 3).join(", ")}${worst.names.length > 3 ? ` and ${worst.names.length - 3} more` : ""} ${worst.names.length === 1 ? "is" : "are"} also on leave on ${fmtDate(worst.date)}. §18 asks managers to keep operational coverage, so this may affect the decision.`);
  }

  // ── §3 effective date ───────────────────────────────────────────────────────
  if (diffDays(cfg.effectiveFrom, start) < 0) {
    add("INFO", "YEAR.EFFECTIVE", "§3", "Before the policy took effect",
      `This leave policy is effective from ${fmtDate(cfg.effectiveFrom)}.`);
  }

  const routing = buildRouting({
    requester: { id: emp.id, role: emp.role, status: emp.status },
    manager: input.manager ?? null,
    hod: input.hod ?? null,
    hr: input.hr ?? null,
    leaveType,
    consecutiveRun: breakdown.consecutiveRun,
    plShortRunMax: cfg.plShortRunMax,
    beforeLastWorkingDay,
  });

  const requiresMedicalDoc = leaveType === "SL" && breakdown.consecutiveRun > cfg.slMedicalDocAfter;

  return {
    ok: !findings.some((f) => f.level === "BLOCK"),
    findings: sortFindings(findings),
    breakdown,
    chargedDays,
    lopDays,
    availableBefore,
    availableAfter,
    noticeDays,
    routing,
    requiresMedicalDoc,
    convertsToPl: requiresMedicalDoc && !input.hasMedicalDoc,
    leaveYear: ly,
  };
}

/**
 * §8 GEN.NO_CLUBBING — is there an existing request of a *different* non-clubbable type that
 * butts directly against this one? Non-working days between them don't break the run, since the
 * intent is that the employee is continuously absent.
 */
function findContiguousDifferentType(
  start: DayKey,
  end: DayKey,
  leaveType: LeaveType,
  existing: ExistingRequest[],
  ctx: CalendarContext,
): ExistingRequest | null {
  const candidates = existing.filter(
    (r) => r.leaveType !== leaveType && NON_CLUBBABLE.includes(r.leaveType as LeaveType),
  );
  if (candidates.length === 0) return null;

  const touchpoints = new Set<DayKey>();
  // Walk outward from each edge across non-working days to find the adjacent working day.
  for (const [from, dir] of [[start, -1], [end, 1]] as const) {
    let cur = addDaysKey(from, dir);
    for (let i = 0; i < 20; i++) {
      touchpoints.add(cur);
      if (isWorkingDay(cur, ctx)) break;
      cur = addDaysKey(cur, dir);
    }
  }

  for (const r of candidates) {
    if (r.days.some((d) => touchpoints.has(d))) return r;
  }
  return null;
}

function sortFindings(f: Finding[]): Finding[] {
  const order: Record<FindingLevel, number> = { BLOCK: 0, WARN: 1, INFO: 2 };
  return [...f].sort((a, b) => order[a.level] - order[b.level]);
}

function fail(findings: Finding[], ly: LeaveYear, input: EvalInput, today: DayKey): Evaluation {
  return {
    ok: false,
    findings: sortFindings(findings),
    breakdown: EMPTY_BREAKDOWN,
    chargedDays: 0,
    lopDays: 0,
    availableBefore: 0,
    availableAfter: 0,
    noticeDays: diffDays(today, input.start),
    routing: [],
    requiresMedicalDoc: false,
    convertsToPl: false,
    leaveYear: ly,
  };
}

export function blockingFindings(e: Evaluation): Finding[] {
  return e.findings.filter((f) => f.level === "BLOCK");
}
