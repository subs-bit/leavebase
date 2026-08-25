import Link from "next/link";
import { redirect } from "next/navigation";
import { Gift, Inbox, TriangleAlert, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageBody, PageHeader } from "@/components/PageHeader";
import { CompOffDecision } from "@/components/CompOffDecision";
import {
  Avatar, AvatarStack, Chip, EmptyState, leaveInk, leaveTint, SectionHeader, StatusChip,
} from "@/components/ui/primitives";
import {
  dayKey, fmtDate, fmtDays, fmtRange, pluralDays, relativeDays, timeAgo, todayKey,
} from "@/lib/date";
import { canApprove, LEAVE_META } from "@/lib/policy/types";
import { getBalances, getPolicy } from "@/lib/services/context";
import { leaveYearOf } from "@/lib/policy/leave-year";

export const metadata = { title: "Approvals" };

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab = "pending" } = await searchParams;
  const user = await requireUser();
  if (!canApprove(user.role)) redirect("/");

  const today = todayKey();
  const cfg = await getPolicy();
  const ly = leaveYearOf(today, cfg);

  const [pending, decided, compClaims, reportIds] = await Promise.all([
    db.approval.findMany({
      where: {
        approverId: user.id,
        action: "PENDING",
        request: { status: { in: ["PENDING", "PENDING_HOD"] } },
      },
      include: {
        request: {
          include: {
            user: {
              select: {
                id: true, name: true, avatarHue: true, designation: true,
                department: { select: { name: true } },
              },
            },
            days: { where: { charged: { gt: 0 } }, select: { date: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.approval.findMany({
      where: { approverId: user.id, action: { in: ["APPROVED", "REJECTED"] } },
      include: {
        request: {
          include: { user: { select: { name: true, avatarHue: true, designation: true } } },
        },
      },
      orderBy: { actedAt: "desc" },
      take: 25,
    }),
    db.compOffCredit.findMany({
      where: { status: "PENDING", user: { managerId: user.id } },
      include: { user: { select: { id: true, name: true, avatarHue: true, designation: true } } },
      orderBy: { workedDate: "asc" },
    }),
    db.user.findMany({ where: { managerId: user.id, isActive: true }, select: { id: true, name: true } }),
  ]);

  // §18 MGR.COVERAGE — who else on the team is away on the same dates.
  const teamIds = reportIds.map((r) => r.id);
  const teamLeaveDays = teamIds.length
    ? await db.leaveRequestDay.findMany({
        where: {
          charged: { gt: 0 },
          request: { userId: { in: teamIds }, status: "APPROVED" },
          date: { gte: new Date(`${today}T00:00:00.000Z`) },
        },
        include: { request: { select: { userId: true } } },
      })
    : [];

  const awayByDate = new Map<string, Set<string>>();
  const nameById = new Map(reportIds.map((r) => [r.id, r.name]));
  for (const d of teamLeaveDays) {
    const k = dayKey(d.date);
    if (!awayByDate.has(k)) awayByDate.set(k, new Set());
    awayByDate.get(k)!.add(d.request.userId);
  }

  // Enrich each pending request with the four things §18 asks an approver to check, before render.
  const enriched = await Promise.all(
    pending.map(async (a) => {
      const r = a.request;
      const start = dayKey(r.startDate);
      const balances = await getBalances(r.userId, cfg, leaveYearOf(start, cfg), today);
      const bal = balances.find((b) => b.leaveType === r.leaveType);

      const clashDates = r.days
        .map((d) => dayKey(d.date))
        .filter((k) => (awayByDate.get(k)?.size ?? 0) >= cfg.maxConcurrentPerTeam);
      const clashPeople = new Set<string>();
      for (const k of clashDates) {
        for (const uid of awayByDate.get(k) ?? []) {
          if (uid !== r.userId) clashPeople.add(nameById.get(uid) ?? "A colleague");
        }
      }

      return { approval: a, request: r, start, end: dayKey(r.endDate), bal, clashPeople: [...clashPeople] };
    }),
  );

  const tabs = [
    { key: "pending", label: "Leave requests", count: pending.length },
    { key: "compoff", label: "Comp-off claims", count: compClaims.length },
    { key: "decided", label: "Decided by me", count: 0 },
  ];

  return (
    <>
      <PageHeader
        title="Approvals"
        subtitle={
          pending.length + compClaims.length === 0
            ? "Nothing is waiting on you."
            : `${pending.length + compClaims.length} ${pending.length + compClaims.length === 1 ? "item needs" : "items need"} your decision`
        }
      />

      <PageBody className="space-y-5">
        <nav className="flex flex-wrap gap-2">
          {tabs.map((t) => {
            const active = tab === t.key;
            return (
              <Link
                key={t.key}
                href={`/approvals?tab=${t.key}`}
                className="chip"
                style={{
                  background: active ? "var(--lt-pl)" : "var(--c-surface)",
                  color: active ? "#fff" : "var(--c-ink-500)",
                  border: `1px solid ${active ? "var(--lt-pl)" : "var(--c-border)"}`,
                  padding: "7px 14px",
                  fontSize: 12.5,
                }}
              >
                {t.label}
                {t.count > 0 && (
                  <span
                    className="rounded-full px-1.5 text-[10px] font-extrabold"
                    style={{
                      background: active ? "rgba(255,255,255,.25)" : "var(--c-warning-tint)",
                      color: active ? "#fff" : "var(--c-warning-ink)",
                    }}
                  >
                    {t.count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {tab === "compoff" ? (
          <div className="card overflow-hidden">
            {compClaims.length === 0 ? (
              <EmptyState
                icon={<Gift size={20} />}
                title="No comp-off claims"
                body="When someone on your team works a holiday or weekly off, their claim lands here."
              />
            ) : (
              <div className="divide-line">
                {compClaims.map((c) => (
                  <div key={c.id} className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3.5">
                        <Avatar name={c.user.name} hue={c.user.avatarHue} size={42} />
                        <div className="min-w-0">
                          <p className="text-[14px] font-bold" style={{ color: "var(--c-ink-900)" }}>
                            {c.user.name}
                          </p>
                          <p className="text-[12px]" style={{ color: "var(--c-ink-500)" }}>
                            Worked {fmtDate(dayKey(c.workedDate))} ·{" "}
                            {c.workedDayType === "HOLIDAY" ? "declared holiday" : "weekly off"}
                          </p>
                        </div>
                      </div>
                      <Chip tone="warning" size="sm">
                        Expires {fmtDate(dayKey(c.expiresAt))}
                      </Chip>
                    </div>
                    <p
                      className="mt-3 rounded-xl px-3.5 py-2.5 text-[12.5px] leading-relaxed"
                      style={{ background: "var(--c-surface-3)", color: "var(--c-ink-700)" }}
                    >
                      {c.reason}
                    </p>
                    <div className="mt-3.5">
                      <CompOffDecision creditId={c.id} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : tab === "decided" ? (
          <div className="card overflow-hidden">
            {decided.length === 0 ? (
              <EmptyState icon={<Inbox size={20} />} title="Nothing decided yet" />
            ) : (
              <div className="divide-line">
                {decided.map((a) => (
                  <Link
                    key={a.id}
                    href={`/requests/${a.requestId}`}
                    className="row-hover flex items-center gap-3.5 px-5 py-3.5"
                  >
                    <Avatar name={a.request.user.name} hue={a.request.user.avatarHue} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-bold" style={{ color: "var(--c-ink-900)" }}>
                        {a.request.user.name}
                        <span className="ml-2 font-semibold" style={{ color: leaveInk(a.request.leaveType) }}>
                          {LEAVE_META[a.request.leaveType as keyof typeof LEAVE_META].name}
                        </span>
                      </p>
                      <p className="truncate text-[12px]" style={{ color: "var(--c-ink-500)" }}>
                        {fmtRange(dayKey(a.request.startDate), dayKey(a.request.endDate))}
                        {a.comment ? ` — "${a.comment}"` : ""}
                      </p>
                    </div>
                    <StatusChip status={a.action} size="sm" />
                    <span className="hidden text-[11px] sm:block" style={{ color: "var(--c-ink-400)" }}>
                      {a.actedAt ? timeAgo(a.actedAt) : ""}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ) : pending.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<Inbox size={20} />}
              title="Your inbox is clear"
              body="Every request that needs your decision shows up here, with the balance, notice period and team coverage already worked out."
            />
          </div>
        ) : (
          <div className="space-y-4">
            {enriched.map(({ approval: a, request: r, start, end, bal, clashPeople }) => {
              const meta = LEAVE_META[r.leaveType as keyof typeof LEAVE_META];

              return (
                <article key={a.id} className="card card-interactive overflow-hidden">
                  <div
                    className="h-[3px] w-full"
                    style={{ background: leaveInk(r.leaveType) }}
                  />
                  <div className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3.5">
                        <Avatar name={r.user.name} hue={r.user.avatarHue} size={46} />
                        <div className="min-w-0">
                          <p className="text-[15px] font-bold" style={{ color: "var(--c-ink-900)" }}>
                            {r.user.name}
                          </p>
                          <p className="truncate text-[12px]" style={{ color: "var(--c-ink-500)" }}>
                            {r.user.designation} · {r.user.department?.name}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span
                          className="chip"
                          style={{ background: leaveTint(r.leaveType), color: leaveInk(r.leaveType) }}
                        >
                          {meta.name}
                        </span>
                        <p className="mt-1.5 text-[11px]" style={{ color: "var(--c-ink-400)" }}>
                          applied {timeAgo(r.appliedAt)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-4">
                      <Metric label="Dates" value={fmtRange(start, end)} sub={relativeDays(start)} />
                      <Metric
                        label="Deducted"
                        value={`${fmtDays(r.chargedDays)} ${r.chargedDays === 1 ? "day" : "days"}`}
                        sub={r.lopDays > 0 ? `${fmtDays(r.lopDays)} would be LOP` : undefined}
                        tone={r.lopDays > 0 ? "warn" : undefined}
                      />
                      <Metric
                        label="Their balance"
                        value={bal ? `${fmtDays(bal.available)} left` : "—"}
                        sub={bal && bal.available < r.chargedDays ? "Short of the request" : "Sufficient"}
                        tone={bal && bal.available < r.chargedDays ? "warn" : undefined}
                      />
                      <Metric
                        label="Notice"
                        value={r.noticeDays < 0 ? "Retrospective" : `${r.noticeDays} days`}
                        sub={a.levelLabel}
                      />
                    </div>

                    <p
                      className="mt-4 rounded-xl px-3.5 py-3 text-[12.5px] leading-relaxed"
                      style={{ background: "var(--c-surface-3)", color: "var(--c-ink-700)" }}
                    >
                      {r.reason}
                    </p>

                    {clashPeople.length > 0 && (
                      <div
                        className="mt-3 flex items-start gap-2.5 rounded-xl px-3.5 py-2.5"
                        style={{ background: "var(--c-warning-tint)" }}
                      >
                        <TriangleAlert size={14} style={{ color: "var(--c-warning-ink)", marginTop: 2 }} />
                        <p className="text-[12px] font-semibold" style={{ color: "var(--c-warning-ink)" }}>
                          Coverage — {clashPeople.slice(0, 3).join(", ")}{" "}
                          {clashPeople.length === 1 ? "is" : "are"} also away on some of these dates. §18
                          asks you to keep enough of the team on the floor.
                        </p>
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2.5">
                      <Link href={`/requests/${r.id}`} className="btn btn-primary">
                        Review and decide
                      </Link>
                      <Link href={`/employees/${r.user.id}`} className="btn btn-ghost">
                        <Users size={14} />
                        Their record
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </PageBody>
    </>
  );
}

function Metric({
  label, value, sub, tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "warn";
}) {
  return (
    <div className="rounded-xl px-3.5 py-3" style={{ background: "var(--c-surface-2)" }}>
      <p className="eyebrow mb-1">{label}</p>
      <p className="text-[13px] font-bold" style={{ color: "var(--c-ink-900)" }}>
        {value}
      </p>
      {sub && (
        <p
          className="mt-0.5 text-[11px] font-semibold"
          style={{ color: tone === "warn" ? "var(--c-warning-ink)" : "var(--c-ink-400)" }}
        >
          {sub}
        </p>
      )}
    </div>
  );
}
