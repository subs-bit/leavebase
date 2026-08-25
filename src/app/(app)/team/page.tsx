import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, Plane, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageBody, PageHeader } from "@/components/PageHeader";
import { BalanceBar } from "@/components/ui/BalanceRing";
import {
  Avatar, Chip, EmptyState, SectionHeader, StatusChip, leaveInk, leaveName,
} from "@/components/ui/primitives";
import {
  addDaysKey, dayKey, fmtDateShort, fmtDays, fmtRange, relativeDays, todayKey,
} from "@/lib/date";
import { getBalances, getPolicy } from "@/lib/services/context";
import { leaveYearOf } from "@/lib/policy/leave-year";
import { canApprove, EMPLOYMENT_STATUS_LABEL, isHrOrAdmin } from "@/lib/policy/types";

export const metadata = { title: "My team" };

export default async function TeamPage() {
  const user = await requireUser();
  if (!canApprove(user.role)) redirect("/");

  const today = todayKey();
  const horizon = addDaysKey(today, 30);
  const cfg = await getPolicy();
  const ly = leaveYearOf(today, cfg);

  // Direct reports, plus the whole department for a HOD.
  const members = await db.user.findMany({
    where: {
      isActive: true,
      id: { not: user.id },
      OR: [
        { managerId: user.id },
        ...(user.role === "HOD" && user.departmentId ? [{ departmentId: user.departmentId }] : []),
        ...(isHrOrAdmin(user.role) ? [{ managerId: user.id }] : []),
      ],
    },
    include: { department: { select: { name: true } } },
    orderBy: { name: "asc" },
  });

  const memberIds = members.map((m) => m.id);

  const [leaveDays, pendingCounts] = await Promise.all([
    memberIds.length
      ? db.leaveRequestDay.findMany({
          where: {
            charged: { gt: 0 },
            request: { userId: { in: memberIds }, status: { in: ["APPROVED", "PENDING", "PENDING_HOD"] } },
            date: {
              gte: new Date(`${today}T00:00:00.000Z`),
              lte: new Date(`${horizon}T00:00:00.000Z`),
            },
          },
          include: {
            request: { select: { id: true, userId: true, leaveType: true, status: true } },
          },
          orderBy: { date: "asc" },
        })
      : Promise.resolve([]),
    memberIds.length
      ? db.leaveRequest.groupBy({
          by: ["userId"],
          where: { userId: { in: memberIds }, status: { in: ["PENDING", "PENDING_HOD"] } },
          _count: true,
        })
      : Promise.resolve([]),
  ]);

  const balancesByUser = new Map(
    await Promise.all(
      members.map(async (m) => [m.id, await getBalances(m.id, cfg, ly, today)] as const),
    ),
  );

  const pendingByUser = new Map(pendingCounts.map((p) => [p.userId, p._count]));

  const upcomingByUser = new Map<string, { dates: string[]; leaveType: string; requestId: string; status: string }>();
  for (const d of leaveDays) {
    const k = d.request.userId;
    if (!upcomingByUser.has(k)) {
      upcomingByUser.set(k, {
        dates: [], leaveType: d.request.leaveType,
        requestId: d.request.id, status: d.request.status,
      });
    }
    upcomingByUser.get(k)!.dates.push(dayKey(d.date));
  }

  const awayToday = members.filter((m) => upcomingByUser.get(m.id)?.dates.includes(today));

  return (
    <>
      <PageHeader
        title="My team"
        subtitle={`${members.length} ${members.length === 1 ? "person" : "people"} · ${awayToday.length} away today`}
      />

      <PageBody className="space-y-5">
        {members.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<Users size={20} />}
              title="No one reports to you yet"
              body="When employees are assigned to you as their reporting manager, they'll appear here with their balances and upcoming leave."
            />
          </div>
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-3">
              <Stat label="Team size" value={String(members.length)} sub="active employees" />
              <Stat
                label="Away today"
                value={String(awayToday.length)}
                sub={awayToday.length ? awayToday.map((m) => m.name.split(" ")[0]).join(", ") : "full strength"}
                tone={awayToday.length >= cfg.maxConcurrentPerTeam ? "warn" : undefined}
              />
              <Stat
                label="Awaiting your decision"
                value={String([...pendingByUser.values()].reduce((s, n) => s + n, 0))}
                sub="leave requests"
              />
            </section>

            <div className="grid gap-4 lg:grid-cols-2">
              {members.map((m) => {
                const balances = balancesByUser.get(m.id) ?? [];
                const upcoming = upcomingByUser.get(m.id);
                const isAway = upcoming?.dates.includes(today);
                const pending = pendingByUser.get(m.id) ?? 0;

                return (
                  <article key={m.id} className="card card-interactive p-5">
                    <div className="flex items-start justify-between gap-3">
                      <Link href={`/employees/${m.id}`} className="flex min-w-0 items-center gap-3.5">
                        <Avatar name={m.name} hue={m.avatarHue} size={46} />
                        <div className="min-w-0">
                          <p className="truncate text-[14.5px] font-bold" style={{ color: "var(--c-ink-900)" }}>
                            {m.name}
                          </p>
                          <p className="truncate text-[12px]" style={{ color: "var(--c-ink-500)" }}>
                            {m.designation}
                          </p>
                          <p className="mt-0.5 text-[11px]" style={{ color: "var(--c-ink-400)" }}>
                            {m.empCode} · {EMPLOYMENT_STATUS_LABEL[m.status]}
                          </p>
                        </div>
                      </Link>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        {isAway ? (
                          <Chip tone="warning" size="sm">
                            <Plane size={11} /> Away now
                          </Chip>
                        ) : (
                          <Chip tone="success" size="sm">In</Chip>
                        )}
                        {pending > 0 && (
                          <Chip tone="brand" size="sm">{pending} pending</Chip>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3">
                      {balances
                        .filter((b) => b.leaveType !== "COMP_OFF")
                        .map((b) => (
                          <BalanceBar
                            key={b.leaveType}
                            available={b.available}
                            granted={Math.max(b.granted, b.available, 1)}
                            color={leaveInk(b.leaveType)}
                            label={leaveName(b.leaveType).replace(" Leave", "")}
                          />
                        ))}
                    </div>

                    {upcoming && (
                      <Link
                        href={`/requests/${upcoming.requestId}`}
                        className="mt-4 flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 transition-colors"
                        style={{ background: "var(--c-surface-3)" }}
                      >
                        <CalendarDays size={14} style={{ color: leaveInk(upcoming.leaveType) }} />
                        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold" style={{ color: "var(--c-ink-700)" }}>
                          {leaveName(upcoming.leaveType)} ·{" "}
                          {fmtRange(upcoming.dates[0], upcoming.dates[upcoming.dates.length - 1])}
                        </span>
                        <StatusChip status={upcoming.status} size="sm" />
                      </Link>
                    )}
                  </article>
                );
              })}
            </div>
          </>
        )}
      </PageBody>
    </>
  );
}

function Stat({
  label, value, sub, tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "warn";
}) {
  return (
    <div className="card p-5">
      <p className="eyebrow">{label}</p>
      <p className="stat mt-2" style={{ fontSize: 32, color: tone === "warn" ? "var(--c-warning-ink)" : undefined }}>
        {value}
      </p>
      <p className="mt-1 truncate text-[12px]" style={{ color: "var(--c-ink-500)" }}>
        {sub}
      </p>
    </div>
  );
}
