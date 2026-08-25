/**
 * Sanity harness for the policy engine. Pure functions only — no database.
 * Run: npx tsx scripts/policy-check.ts
 */
import { buildBreakdown, makeContext } from "../src/lib/policy/calendar";
import { DEFAULT_POLICY } from "../src/lib/policy/config";
import { evaluateRequest } from "../src/lib/policy/evaluate";
import {
  accrualSchedule, accruedToDate, computeCarryForward, leaveYearOf, quartersOf,
} from "../src/lib/policy/leave-year";
import { summariseBalance } from "../src/lib/policy/balance";
import type { BalanceSummary } from "../src/lib/policy/balance";

let pass = 0, fail = 0;
function eq(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       expected ${e}\n       actual   ${a}`); }
}
function section(s: string) { console.log(`\n${s}`); }

const cfg = DEFAULT_POLICY;
// FY 2026-27 holidays (a realistic Indian set)
const holidays = [
  { date: "2026-08-15", name: "Independence Day", type: "NATIONAL" },
  { date: "2026-10-02", name: "Gandhi Jayanti", type: "NATIONAL" },
  { date: "2026-11-09", name: "Diwali", type: "DECLARED" },
  { date: "2026-12-25", name: "Christmas", type: "DECLARED" },
];
const ctx = () => makeContext({ weeklyOffs: [0, 6], holidays });

// ── leave year ────────────────────────────────────────────────────────────────
section("Leave year (§3)");
eq("Aug 2026 falls in FY 2026-27", leaveYearOf("2026-08-12", cfg).label, "2026-27");
eq("Mar 2027 still FY 2026-27", leaveYearOf("2027-03-31", cfg).label, "2026-27");
eq("Apr 2027 rolls over", leaveYearOf("2027-04-01", cfg).label, "2027-28");
eq("year bounds", [leaveYearOf("2026-08-12", cfg).start, leaveYearOf("2026-08-12", cfg).end],
  ["2026-04-01", "2027-03-31"]);
eq("Q1 is Apr–Jun", [quartersOf(leaveYearOf("2026-08-12", cfg))[0].start, quartersOf(leaveYearOf("2026-08-12", cfg))[0].end],
  ["2026-04-01", "2026-06-30"]);
eq("Q4 is Jan–Mar", [quartersOf(leaveYearOf("2026-08-12", cfg))[3].start, quartersOf(leaveYearOf("2026-08-12", cfg))[3].end],
  ["2027-01-01", "2027-03-31"]);

// ── accrual ───────────────────────────────────────────────────────────────────
section("Accrual (§7)");
const ly = leaveYearOf("2026-08-12", cfg);
const veteran = { joinDate: "2020-01-01", confirmDate: "2020-07-01", lastWorkingDay: null, status: "CONFIRMED" };
eq("full-year PL = 15", accruedToDate("PL", veteran, ly, cfg, "2027-03-31"), 15);
eq("PL after Q1 = 4 (15/4 rounded to the half)", accruedToDate("PL", veteran, ly, cfg, "2026-04-01"), 4);
eq("CL full year = 6", accruedToDate("CL", veteran, ly, cfg, "2027-03-31"), 6);
const probationer = { joinDate: "2026-04-01", confirmDate: null, lastWorkingDay: null, status: "PROBATION" };
eq("probationer accrues no PL (§6/§7)", accruedToDate("PL", probationer, ly, cfg, "2027-03-31"), 0);
eq("probationer still accrues CL", accruedToDate("CL", probationer, ly, cfg, "2027-03-31"), 6);
const midJoiner = { joinDate: "2026-10-01", confirmDate: "2027-01-01", lastWorkingDay: null, status: "CONFIRMED" };
eq("Oct joiner CL pro-rata = 3", accruedToDate("CL", midJoiner, ly, cfg, "2027-03-31"), 3);
eq("PL only from confirmation (Jan) = 4", accruedToDate("PL", midJoiner, ly, cfg, "2027-03-31"), 4);
eq("quarters always sum to the annual grant", accrualSchedule("PL", veteran, ly, cfg, "2027-03-31").reduce((s, l) => s + l.amount, 0), 15);

section("Carry forward (§4/§5/§6)");
eq("CL never carries", computeCarryForward("CL", 4, cfg).carried, 0);
eq("CL lapses fully", computeCarryForward("CL", 4, cfg).lapsed, 4);
eq("SL carries in full", computeCarryForward("SL", 11, cfg).carried, 11);
eq("PL carries under the cap", computeCarryForward("PL", 22, cfg).carried, 22);
eq("PL capped at 30", computeCarryForward("PL", 38, cfg).carried, 30);
eq("PL excess lapses", computeCarryForward("PL", 38, cfg).lapsed, 8);

// ── the sandwich rule ─────────────────────────────────────────────────────────
section("Sandwich rule (§8)");
// 2026-08-14 is a Friday, 15th Sat (holiday), 16th Sun, 17th Mon.
const friOnly = buildBreakdown({ start: "2026-08-14", end: "2026-08-14", leaveType: "CL", halfDay: "NONE", ctx: ctx() });
eq("single Friday charges 1", friOnly.chargedDays, 1);

const friToMon = buildBreakdown({ start: "2026-08-14", end: "2026-08-17", leaveType: "CL", halfDay: "NONE", ctx: ctx() });
eq("Fri→Mon charges 4 (weekend + holiday sandwiched)", friToMon.chargedDays, 4);
eq("  ...of which 2 are non-working", friToMon.sandwichedDays, 2);

const satSunOnly = buildBreakdown({ start: "2026-08-15", end: "2026-08-16", leaveType: "CL", halfDay: "NONE", ctx: ctx() });
eq("weekend alone charges 0", satSunOnly.chargedDays, 0);

// Leading/trailing non-working days inside the range are NOT charged when nothing precedes them.
const satToTue = buildBreakdown({ start: "2026-08-15", end: "2026-08-18", leaveType: "CL", halfDay: "NONE", ctx: ctx() });
eq("Sat→Tue charges only Mon+Tue", satToTue.chargedDays, 2);

// Cross-request sandwich: approved leave on Mon 17th, new request Fri 14th.
const withNeighbour = buildBreakdown({
  start: "2026-08-14", end: "2026-08-14", leaveType: "CL", halfDay: "NONE",
  ctx: makeContext({ weeklyOffs: [0, 6], holidays, existingLeaveDays: ["2026-08-17"] }),
});
eq("Friday + approved Monday pulls in the weekend", withNeighbour.chargedDays, 3);
eq("  ...2 of them as extension days", withNeighbour.extensionDays.length, 2);

// Same, but the weekend was already charged by the other request — never charge twice.
const noDoubleCharge = buildBreakdown({
  start: "2026-08-14", end: "2026-08-14", leaveType: "CL", halfDay: "NONE",
  ctx: makeContext({
    weeklyOffs: [0, 6], holidays,
    existingLeaveDays: ["2026-08-17"],
    alreadyChargedDays: ["2026-08-15", "2026-08-16"],
  }),
});
eq("already-charged bridge days aren't charged again", noDoubleCharge.chargedDays, 1);

section("Maternity absorbs all days (§9)");
const mat = buildBreakdown({ start: "2026-08-15", end: "2026-08-16", leaveType: "MATERNITY", halfDay: "NONE", ctx: ctx() });
eq("maternity charges weekends", mat.chargedDays, 2);

section("Half day (§14)");
const half = buildBreakdown({ start: "2026-08-14", end: "2026-08-14", leaveType: "CL", halfDay: "FIRST_HALF", ctx: ctx() });
eq("half day charges 0.5", half.chargedDays, 0.5);

// ── full evaluation ───────────────────────────────────────────────────────────
section("Evaluation");
const emp = {
  id: "u1", name: "Test", role: "EMPLOYEE", gender: "MALE", employmentType: "FULL_TIME",
  isActive: true, joinDate: "2020-01-01", confirmDate: "2020-07-01",
  lastWorkingDay: null, status: "CONFIRMED",
};
const bal = (t: string, available: number): BalanceSummary => ({
  leaveType: t as never, opening: 0, accrued: available, earned: 0, adjusted: 0,
  used: 0, restored: 0, lapsed: 0, available, granted: available, entitlementAnnual: available,
});
const base = {
  employee: emp, cfg, ctx: ctx(), existing: [],
  balances: [bal("CL", 6), bal("SL", 6), bal("PL", 15), bal("COMP_OFF", 0)],
  manager: { id: "m1", name: "Mgr", role: "MANAGER" },
  hod: { id: "h1", name: "Hod", role: "HOD" },
  hr: { id: "hr1", name: "HR", role: "HR" },
  today: "2026-08-01" as const,
};

const plShortNotice = evaluateRequest({
  ...base, leaveType: "PL", start: "2026-08-10", end: "2026-08-11", halfDay: "NONE",
});
eq("PL with 9 days' notice is blocked (§6 needs 15)", plShortNotice.ok, false);
eq("  blocked by PL.NOTICE_15", plShortNotice.findings.find(f => f.level === "BLOCK")?.ruleId, "PL.NOTICE_15");

const plGoodNotice = evaluateRequest({
  ...base, leaveType: "PL", start: "2026-09-01", end: "2026-09-02", halfDay: "NONE",
});
eq("PL with 31 days' notice passes", plGoodNotice.ok, true);
eq("  routes to manager only", plGoodNotice.routing.length, 1);

const plLongRun = evaluateRequest({
  ...base, leaveType: "PL", start: "2026-09-07", end: "2026-09-11", halfDay: "NONE",
});
eq("5-day PL with 37 days' notice passes", plLongRun.ok, true);
eq("  routes to manager then HOD (§6)", plLongRun.routing.map(r => r.label), ["Reporting Manager", "Head of Department"]);

const plLongShortNotice = evaluateRequest({
  ...base, leaveType: "PL", start: "2026-08-24", end: "2026-08-28", halfDay: "NONE",
});
eq("5-day PL with 23 days' notice blocked (needs 30)", plLongShortNotice.findings.find(f => f.level === "BLOCK")?.ruleId, "PL.NOTICE_30");

const probPl = evaluateRequest({
  ...base,
  employee: { ...emp, confirmDate: null, status: "PROBATION" },
  leaveType: "PL", start: "2026-10-01", end: "2026-10-01", halfDay: "NONE",
  balances: [bal("CL", 6), bal("SL", 6), bal("PL", 0), bal("COMP_OFF", 0)],
});
eq("probationer blocked from PL (§6)", probPl.findings.find(f => f.level === "BLOCK")?.ruleId, "PL.CONFIRMED_ONLY");

const backdatedCl = evaluateRequest({
  ...base, leaveType: "CL", start: "2026-07-20", end: "2026-07-20", halfDay: "NONE",
});
eq("backdated CL blocked (§15)", backdatedCl.findings.find(f => f.level === "BLOCK")?.ruleId, "PROC.ADVANCE");

const backdatedSl = evaluateRequest({
  ...base, leaveType: "SL", start: "2026-07-30", end: "2026-07-30", halfDay: "NONE",
});
eq("backdated SL allowed (§15 exempts SL)", backdatedSl.ok, true);

const longSl = evaluateRequest({
  ...base, leaveType: "SL", start: "2026-08-03", end: "2026-08-06", halfDay: "NONE",
});
eq("4 consecutive SL warns about medical docs (§5)", longSl.findings.some(f => f.ruleId === "SL.DOC_FAILURE"), true);
eq("  and marks conversion to PL", longSl.convertsToPl, true);

const overBalance = evaluateRequest({
  ...base, leaveType: "CL", start: "2026-09-07", end: "2026-09-11", halfDay: "NONE",
  balances: [bal("CL", 2), bal("SL", 6), bal("PL", 15), bal("COMP_OFF", 0)],
});
eq("insufficient CL becomes LOP not a block (§13)", overBalance.ok, true);
eq("  3 days of LOP", overBalance.lopDays, 3);

const clubbing = evaluateRequest({
  ...base, leaveType: "CL", start: "2026-09-07", end: "2026-09-08", halfDay: "NONE",
  existing: [{ id: "r1", leaveType: "SL", status: "APPROVED", start: "2026-09-09", end: "2026-09-09", days: ["2026-09-09"] }],
});
eq("CL butting against SL is blocked (§8)", clubbing.findings.find(f => f.level === "BLOCK")?.ruleId, "GEN.NO_CLUBBING");

const overlap = evaluateRequest({
  ...base, leaveType: "CL", start: "2026-09-07", end: "2026-09-08", halfDay: "NONE",
  existing: [{ id: "r1", leaveType: "CL", status: "APPROVED", start: "2026-09-08", end: "2026-09-08", days: ["2026-09-08"] }],
});
eq("overlapping own leave is blocked", overlap.findings.find(f => f.level === "BLOCK")?.ruleId, "INPUT.OVERLAP");

const crossYear = evaluateRequest({
  ...base, leaveType: "CL", start: "2027-03-30", end: "2027-04-02", halfDay: "NONE",
});
eq("request crossing 31 March is blocked (§3)", crossYear.findings.find(f => f.level === "BLOCK")?.ruleId, "YEAR.FY");

const compNoCredit = evaluateRequest({
  ...base, leaveType: "COMP_OFF", start: "2026-09-07", end: "2026-09-07", halfDay: "NONE",
  compOffAvailable: 0,
});
eq("comp-off without credit is blocked (§11)", compNoCredit.findings.find(f => f.level === "BLOCK")?.ruleId, "CO.CLAIM_FIRST");

const maternityMale = evaluateRequest({
  ...base, leaveType: "MATERNITY", start: "2026-12-01", end: "2027-02-01", halfDay: "NONE",
  expectedDelivery: "2026-12-15", maternityPattern: "SPLIT_8_18",
});
eq("maternity blocked for male employee (§9)", maternityMale.findings.some(f => f.ruleId === "ML.ELIGIBLE"), true);

const weekendOnly = evaluateRequest({
  ...base, leaveType: "CL", start: "2026-09-05", end: "2026-09-06", halfDay: "NONE",
});
eq("weekend-only request is blocked as pointless", weekendOnly.findings.find(f => f.level === "BLOCK")?.ruleId, "INPUT.NO_DAYS");

const halfMulti = evaluateRequest({
  ...base, leaveType: "CL", start: "2026-09-07", end: "2026-09-08", halfDay: "FIRST_HALF",
});
eq("half-day across 2 days blocked (§14)", halfMulti.findings.find(f => f.level === "BLOCK")?.ruleId, "HALF.WINDOW");

section("Balance ledger");
const summary = summariseBalance("PL", [
  { leaveType: "PL", entryKind: "OPENING", amount: 8, effectiveDate: "2026-04-01" },
  { leaveType: "PL", entryKind: "ACCRUAL", amount: 3.75, effectiveDate: "2026-04-01" },
  { leaveType: "PL", entryKind: "ACCRUAL", amount: 3.75, effectiveDate: "2026-07-01" },
  { leaveType: "PL", entryKind: "AVAIL", amount: -5, effectiveDate: "2026-08-10" },
  { leaveType: "PL", entryKind: "CANCEL_CREDIT", amount: 2, effectiveDate: "2026-08-12" },
  { leaveType: "CL", entryKind: "ACCRUAL", amount: 1.5, effectiveDate: "2026-04-01" },
], veteran, ly, cfg, "2026-08-12");
eq("ledger sums to available", summary.available, 12.5);
eq("used tracked separately", summary.used, 5);
eq("other types excluded", summary.accrued, 7.5);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
