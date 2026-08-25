import "server-only";

import { db } from "@/lib/db";
import { dayKey, DayKey, todayKey } from "@/lib/date";
import { CalendarContext, makeContext } from "@/lib/policy/calendar";
import { PolicyConfig, resolvePolicy } from "@/lib/policy/config";
import { LeaveYear, leaveYearOf, toEligibility } from "@/lib/policy/leave-year";
import { summariseAll } from "@/lib/policy/balance";
import type { BalanceSummary } from "@/lib/policy/balance";
import type { EvalEmployee, ExistingRequest, TeamConflict } from "@/lib/policy/evaluate";
import type { RoutingPerson } from "@/lib/policy/routing";

/** The live policy configuration. */
export async function getPolicy(): Promise<PolicyConfig> {
  const row = await db.policySetting.findUnique({ where: { id: "singleton" } });
  return resolvePolicy(row?.json);
}

export async function savePolicy(cfg: PolicyConfig): Promise<void> {
  await db.policySetting.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", json: JSON.stringify(cfg) },
    update: { json: JSON.stringify(cfg) },
  });
}

const LIVE = ["PENDING", "PENDING_HOD", "APPROVED"];

/**
 * Calendar context for one employee: holidays, weekly offs, and the days they already have
 * leave on — which is what lets the sandwich rule see across request boundaries.
 */
export async function getCalendarContext(
  userId: string,
  cfg: PolicyConfig,
  opts: { excludeRequestId?: string; from?: DayKey; to?: DayKey } = {},
): Promise<CalendarContext> {
  const holidays = await db.holiday.findMany({ orderBy: { date: "asc" } });

  const requests = await db.leaveRequest.findMany({
    where: {
      userId,
      status: { in: LIVE },
      ...(opts.excludeRequestId ? { id: { not: opts.excludeRequestId } } : {}),
    },
    select: { id: true, days: { select: { date: true, charged: true } } },
  });

  const existingLeaveDays: DayKey[] = [];
  const alreadyChargedDays: DayKey[] = [];
  for (const r of requests) {
    for (const d of r.days) {
      const k = dayKey(d.date);
      existingLeaveDays.push(k);
      if (d.charged > 0) alreadyChargedDays.push(k);
    }
  }

  return makeContext({
    weeklyOffs: cfg.weeklyOffs,
    holidays: holidays.map((h) => ({ date: h.date, name: h.name, type: h.type })),
    existingLeaveDays,
    alreadyChargedDays,
  });
}

/** Ledger-derived balances for an employee in a leave year. */
export async function getBalances(
  userId: string,
  cfg: PolicyConfig,
  ly?: LeaveYear,
  asOf: DayKey = todayKey(),
): Promise<BalanceSummary[]> {
  const year = ly ?? leaveYearOf(asOf, cfg);
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { joinDate: true, confirmDate: true, lastWorkingDay: true, status: true },
  });
  const entries = await db.leaveLedger.findMany({
    where: { userId, leaveYear: year.label },
    orderBy: { effectiveDate: "asc" },
  });
  return summariseAll(entries, toEligibility(user), year, cfg, asOf);
}

/** Approved, unexpired comp-off credits available to spend right now. */
export async function getCompOffAvailable(userId: string, asOf: DayKey = todayKey()): Promise<number> {
  const credits = await db.compOffCredit.findMany({
    where: { userId, status: "APPROVED" },
  });
  return credits.filter((c) => dayKey(c.expiresAt) >= asOf).length;
}

export async function getCompOffUsedThisYear(userId: string, ly: LeaveYear): Promise<number> {
  return db.compOffCredit.count({
    where: { userId, status: "CONSUMED", leaveYear: ly.label },
  });
}

/** The employee's other live requests, as the engine wants them. */
export async function getExistingRequests(
  userId: string,
  excludeRequestId?: string,
): Promise<ExistingRequest[]> {
  const rows = await db.leaveRequest.findMany({
    where: {
      userId,
      status: { in: LIVE },
      ...(excludeRequestId ? { id: { not: excludeRequestId } } : {}),
    },
    select: {
      id: true, leaveType: true, status: true, startDate: true, endDate: true,
      days: { select: { date: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    leaveType: r.leaveType,
    status: r.status,
    start: dayKey(r.startDate),
    end: dayKey(r.endDate),
    days: r.days.map((d) => dayKey(d.date)),
  }));
}

/** Who else on the same team is away, per date — feeds §18 coverage warnings. */
export async function getTeamConflicts(
  userId: string,
  from: DayKey,
  to: DayKey,
): Promise<TeamConflict[]> {
  const me = await db.user.findUnique({
    where: { id: userId },
    select: { managerId: true, departmentId: true },
  });
  if (!me) return [];

  const peers = await db.user.findMany({
    where: {
      id: { not: userId },
      isActive: true,
      OR: [
        ...(me.managerId ? [{ managerId: me.managerId }] : []),
        ...(me.departmentId ? [{ departmentId: me.departmentId }] : []),
      ],
    },
    select: { id: true, name: true },
  });
  if (peers.length === 0) return [];

  const peerMap = new Map(peers.map((p) => [p.id, p.name]));
  const days = await db.leaveRequestDay.findMany({
    where: {
      charged: { gt: 0 },
      date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T00:00:00.000Z`) },
      request: { userId: { in: peers.map((p) => p.id) }, status: { in: LIVE } },
    },
    select: { date: true, request: { select: { userId: true } } },
  });

  const byDate = new Map<DayKey, Set<string>>();
  for (const d of days) {
    const k = dayKey(d.date);
    if (!byDate.has(k)) byDate.set(k, new Set());
    byDate.get(k)!.add(peerMap.get(d.request.userId) ?? "A colleague");
  }
  return [...byDate.entries()].map(([date, names]) => ({ date, names: [...names] }));
}

export type EvalBundle = {
  cfg: PolicyConfig;
  employee: EvalEmployee;
  ctx: CalendarContext;
  balances: BalanceSummary[];
  existing: ExistingRequest[];
  compOffAvailable: number;
  compOffUsedThisYear: number;
  manager: RoutingPerson;
  hod: RoutingPerson;
  hr: RoutingPerson;
  leaveYear: LeaveYear;
};

/** Everything the rule engine needs about one employee, in one round of queries. */
export async function loadEvalBundle(
  userId: string,
  opts: { excludeRequestId?: string; from?: DayKey; to?: DayKey; asOf?: DayKey } = {},
): Promise<EvalBundle> {
  const asOf = opts.asOf ?? todayKey();
  const cfg = await getPolicy();
  const ly = leaveYearOf(opts.from ?? asOf, cfg);

  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      manager: { select: { id: true, name: true, role: true } },
      department: { select: { id: true, name: true, hodId: true } },
    },
  });

  const [ctx, balances, existing, compOffAvailable, compOffUsedThisYear] = await Promise.all([
    getCalendarContext(userId, cfg, { excludeRequestId: opts.excludeRequestId }),
    getBalances(userId, cfg, ly, asOf),
    getExistingRequests(userId, opts.excludeRequestId),
    getCompOffAvailable(userId, asOf),
    getCompOffUsedThisYear(userId, ly),
  ]);

  const hodRow = user.department?.hodId
    ? await db.user.findUnique({
        where: { id: user.department.hodId },
        select: { id: true, name: true, role: true },
      })
    : null;

  const hrRow = await db.user.findFirst({
    where: { role: { in: ["HR", "ADMIN"] }, isActive: true },
    orderBy: { role: "asc" }, // HR before ADMIN
    select: { id: true, name: true, role: true },
  });

  return {
    cfg,
    leaveYear: ly,
    ctx,
    balances,
    existing,
    compOffAvailable,
    compOffUsedThisYear,
    manager: user.manager ?? null,
    hod: hodRow && hodRow.id !== userId ? hodRow : null,
    hr: hrRow ?? null,
    employee: {
      id: user.id,
      name: user.name,
      role: user.role,
      gender: user.gender,
      employmentType: user.employmentType,
      isActive: user.isActive,
      status: user.status,
      joinDate: dayKey(user.joinDate),
      confirmDate: user.confirmDate ? dayKey(user.confirmDate) : null,
      lastWorkingDay: user.lastWorkingDay ? dayKey(user.lastWorkingDay) : null,
    },
  };
}
