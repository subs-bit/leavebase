import Link from "next/link";
import {
  ArrowRight, CalendarDays, Clock3, Gift, Inbox, PartyPopper, Plane, ShieldAlert, Sparkles,
  TrendingUp, TriangleAlert,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageBody, PageHeader } from "@/components/PageHeader";
import { RequestRow } from "@/components/RequestRow";
import { BalanceRing } from "@/components/ui/BalanceRing";
import {
  Avatar, AvatarStack, Chip, EmptyState, leaveInk, leaveTint, LeaveChip, SectionHeader,
} from "@/components/ui/primitives";
import {
  addDaysKey, dayKey, diffDays, fmtDate, fmtDateShort, fmtDays, fmtRange, pluralDays, relativeDays,
  todayKey,
} from "@/lib/date";
import { getBalances, getCompOffAvailable, getPolicy } from "@/lib/services/context";
import { daysUntilYearEnd, leaveYearOf, plCeilingHeadroom } from "@/lib/policy/leave-year";
import { BALANCE_TYPES, canApprove, isFounder, LEAVE_META } from "@/lib/policy/types";
import { FounderDashboard } from "./FounderDashboard";
import { runMaintenance } from "@/lib/services/accrual";

export default async function DashboardPage() {
  const user = await requireUser();

  // A founder holds no leave of their own — they get the company view instead of empty rings.
  if (isFounder(user.role)) return <FounderDashboard user={user} />;

  await runMaintenance(user.id);

  const today = todayKey();
  const cfg = await getPolicy();
  const ly = leaveYearOf(today, cfg);
  const balances = await getBalances(user.id, cfg, ly, today);
  const compAvailable = await getCompOffAvailable(user.id, today);
  const approver = canApprove(user.role);

  const [myRequests, upcoming, pendingApprovals, teamAway, nextHolidays, expiringComp] =
    await Promise.all([
      db.leaveRequest.findMany({
        where: { userId: user.id },
        orderBy: { appliedAt: "desc" },
        take: 5,
      }),
      db.leaveRequest.findFirst({
        where: {
          userId: user.id,
          status: { in: ["APPROVED", "PENDING", "PENDING_HOD"] },
          endDate: { gte: new Date(`${today}T00:00:00.000Z`) },
        },
        orderBy: { startDate: "asc" },
      }),
      approver
        ? db.approval.findMany({
            where: {
              approverId: user.id,
              action: "PENDING",
              request: { status: { in: ["PENDING", "PENDING_HOD"] } },
            },
            include: {
              request: {
                include: { user: { select: { name: true, avatarHue: true, designation: true } } },
              },
            },
            orderBy: { createdAt: "asc" },
            take: 4,
          })
        : Promise.resolve([]),
      db.leaveRequestDay.findMany({
        where: {
          charged: { gt: 0 },
          date: {
            gte: new Date(`${today}T00:00:00.000Z`),
            lte: new Date(`${addDaysKey(today, 13)}T00:00:00.000Z`),
          },
          request: {
            status: "APPROVED",
            userId: { not: user.id },
            ...(user.departmentId ? { user: { departmentId: user.departmentId } } : {}),
          },
        },
        include: {
          request: {
            select: {
              leaveType: true,
              user: { select: { id: true, name: true, avatarHue: true, designation: true } },
            },
          },
        },
        orderBy: { date: "asc" },
      }),
      db.holiday.findMany({
        where: { date: { gte: new Date(`${today}T00:00:00.000Z`) } },
        orderBy: { date: "asc" },
        take: 3,
      }),
      db.compOffCredit.findMany({
        where: { userId: user.id, status: "APPROVED" },
        orderBy: { expiresAt: "asc" },
      }),
    ]);

  const pl = balances.find((b) => b.leaveType === "PL");
  const cl = balances.find((b) => b.leaveType === "CL");
  const totalAvailable = balances.reduce((s, b) => s + b.available, 0);
  const totalUsed = balances.reduce((s, b) => s + b.used, 0);

  // ── nudges: the things worth telling someone the moment they sign in ──
  const nudges: { tone: "warning" | "info" | "danger"; icon: React.ReactNode; text: string }[] = [];
  const yearEnd = daysUntilYearEnd(ly, today);
  if (cl && cl.available > 0 && yearEnd <= 75) {
    nudges.push({
      tone: "warning",
      icon: <Clock3 size={14} />,
      text: `${pluralDays(cl.available)} of Casual Leave lapses on ${fmtDate(ly.end)} — it doesn't carry forward (§4).`,
    });
  }
  if (pl) {
    const headroom = plCeilingHeadroom(pl.available, cfg);
    if (headroom <= 4) {
      nudges.push({
        tone: "warning",
        icon: <TriangleAlert size={14} />,
        text: `Privileged Leave is ${pluralDays(headroom)} below the ${cfg.plAccumulationCap}-day ceiling. Anything above it lapses (§6).`,
      });
    }
  }
  const soonComp = expiringComp.filter((c) => diffDays(today, dayKey(c.expiresAt)) <= 10);
  if (soonComp.length > 0) {
    nudges.push({
      tone: "danger",
      icon: <Gift size={14} />,
      text: `${soonComp.length} comp-off${soonComp.length === 1 ? "" : "s"} expire${soonComp.length === 1 ? "s" : ""} by ${fmtDate(dayKey(soonComp[0].expiresAt))} — use ${soonComp.length === 1 ? "it" : "them"} or ${soonComp.length === 1 ? "it lapses" : "they lapse"} (§11).`,
    });
  }
  if (user.status === "PROBATION") {
    nudges.push({
      tone: "info",
      icon: <Sparkles size={14} />,
      text: "You're on probation — Casual and Sick Leave are available now; Privileged Leave starts on confirmation (§6).",
    });
  }

  // team away, grouped by person over the next fortnight
  const awayByPerson = new Map<
    string,
    { name: string; avatarHue: number; designation: string; days: string[]; type: string }
  >();
  for (const d of teamAway) {
    const u = d.request.user;
    if (!awayByPerson.has(u.id)) {
      awayByPerson.set(u.id, {
        name: u.name, avatarHue: u.avatarHue, designation: u.designation,
        days: [], type: d.request.leaveType,
      });
    }
    awayByPerson.get(u.id)!.days.push(dayKey(d.date));
  }
  const awayList = [...awayByPerson.values()].sort((a, b) => (a.days[0] < b.days[0] ? -1 : 1));
  const awayToday = awayList.filter((p) => p.days.includes(today));

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = user.name.split(" ")[0];

  return (
    <>
      <PageHeader
        title={`${greeting}, ${firstName}`}
        subtitle={`${LEAVE_META.PL.name.replace("Privileged Leave", "Leave year")} ${ly.label} · ${fmtDate(ly.start)} to ${fmtDate(ly.end)}`}
      />

      <PageBody className="space-y-6">
        {/* ── hero ───────────────────────────────────────────────────────── */}
        <section className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
          <div
            className="prism-panel animate-in flex flex-col justify-between p-6 sm:p-7"
            style={{ borderRadius: 28, minHeight: 232, boxShadow: "var(--sh-glow)" }}
          >
            <div className="relative z-10">
              <p
                className="eyebrow"
                style={{ color: "rgba(255,255,255,.78)" }}
              >
                Leave available
              </p>
              <div className="mt-2.5 flex items-end gap-3">
                <span
                  className="stat"
                  style={{ fontSize: 54, color: "#fff", lineHeight: 0.95 }}
                >
                  {fmtDays(totalAvailable)}
                </span>
                <span
                  className="mb-1.5 text-[14px] font-semibold"
                  style={{ color: "rgba(255,255,255,.82)" }}
                >
                  days across all types
                </span>
              </div>
              <p className="mt-2 text-[13px]" style={{ color: "rgba(255,255,255,.8)" }}>
                {totalUsed > 0
                  ? `You've taken ${pluralDays(totalUsed)} so far this leave year.`
                  : "You haven't taken any leave this year yet."}
              </p>
            </div>

            <div className="relative z-10 mt-6 flex flex-wrap items-center gap-2.5">
              <Link
                href="/apply"
                className="btn"
                style={{ background: "#fff", color: "var(--brand-600)" }}
              >
                Apply for leave
                <ArrowRight size={15} strokeWidth={2.6} />
              </Link>
              {upcoming ? (
                <span
                  className="chip"
                  style={{ background: "rgba(255,255,255,.18)", color: "#fff", padding: "8px 14px" }}
                >
                  <Plane size={13} />
                  Next: {LEAVE_META[upcoming.leaveType as keyof typeof LEAVE_META].name} {relativeDays(dayKey(upcoming.startDate))}
                </span>
              ) : (
                <span
                  className="chip"
                  style={{ background: "rgba(255,255,255,.18)", color: "#fff", padding: "8px 14px" }}
                >
                  <CalendarDays size={13} />
                  Nothing booked
                </span>
              )}
            </div>
          </div>

          {/* balance rings */}
          <div className="card p-5 sm:p-6">
            <SectionHeader
              eyebrow="Your balances"
              title="Where you stand"
              action={
                <Link
                  href="/requests?tab=balance"
                  className="text-[12px] font-bold"
                  style={{ color: "var(--brand-500)" }}
                >
                  Statement
                </Link>
              }
            />
            <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
              {BALANCE_TYPES.map((type, i) => {
                const b = balances.find((x) => x.leaveType === type)!;
                const isComp = type === "COMP_OFF";
                const available = isComp ? compAvailable : b.available;
                const granted = isComp ? Math.max(compAvailable, b.granted, 1) : Math.max(b.granted, available, 1);
                const notEligible = type === "PL" && user.status === "PROBATION";
                return (
                  <BalanceRing
                    key={type}
                    available={notEligible ? 0 : available}
                    granted={notEligible ? 1 : granted}
                    annualEntitlement={notEligible || isComp ? undefined : b.entitlementAnnual}
                    color={leaveInk(type)}
                    label={LEAVE_META[type].short === "CO" ? "Comp-off" : LEAVE_META[type].name.replace(" Leave", "")}
                    sublabel={
                      notEligible ? "On confirmation" : isComp ? `${b.used} used` : `${fmtDays(b.used)} used`
                    }
                    size={104}
                    stroke={9}
                    delay={i * 90}
                  />
                );
              })}
            </div>
          </div>
        </section>

        {/* ── nudges ─────────────────────────────────────────────────────── */}
        {nudges.length > 0 && (
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {nudges.map((n, i) => {
              const tones = {
                warning: { bg: "var(--c-warning-tint)", fg: "var(--c-warning-ink)" },
                info: { bg: "var(--c-info-tint)", fg: "var(--c-info-ink)" },
                danger: { bg: "var(--c-danger-tint)", fg: "var(--c-danger-ink)" },
              }[n.tone];
              return (
                <div
                  key={i}
                  className="flex items-start gap-2.5 rounded-2xl px-4 py-3"
                  style={{ background: tones.bg }}
                >
                  <span style={{ color: tones.fg, marginTop: 2 }}>{n.icon}</span>
                  <p className="text-[12.5px] font-semibold leading-snug" style={{ color: tones.fg }}>
                    {n.text}
                  </p>
                </div>
              );
            })}
          </section>
        )}

        {/* ── main grid ──────────────────────────────────────────────────── */}
        <section className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          <div className="space-y-5">
            {approver && (
              <div className="card overflow-hidden">
                <div className="flex items-center justify-between px-5 pt-5">
                  <SectionHeader
                    eyebrow="Needs you"
                    title={
                      pendingApprovals.length === 0
                        ? "Approvals"
                        : `${pendingApprovals.length} awaiting your decision`
                    }
                  />
                  {pendingApprovals.length > 0 && (
                    <Link href="/approvals" className="btn btn-ghost" style={{ padding: "7px 14px" }}>
                      Review
                    </Link>
                  )}
                </div>
                <div className="mt-4">
                  {pendingApprovals.length === 0 ? (
                    <EmptyState
                      icon={<Inbox size={20} />}
                      title="Your inbox is clear"
                      body="Nothing is waiting on you right now."
                    />
                  ) : (
                    <div className="divide-line">
                      {pendingApprovals.map((a) => (
                        <RequestRow
                          key={a.id}
                          showPerson
                          request={{
                            id: a.request.id,
                            code: a.request.code,
                            leaveType: a.request.leaveType,
                            status: a.request.status,
                            startDate: dayKey(a.request.startDate),
                            endDate: dayKey(a.request.endDate),
                            chargedDays: a.request.chargedDays,
                            reason: a.request.reason,
                            appliedAt: a.request.appliedAt.toISOString(),
                            halfDay: a.request.halfDay,
                            user: a.request.user,
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-5 pt-5">
                <SectionHeader eyebrow="Your activity" title="Recent requests" />
                <Link
                  href="/requests"
                  className="text-[12px] font-bold"
                  style={{ color: "var(--brand-500)" }}
                >
                  See all
                </Link>
              </div>
              <div className="mt-4">
                {myRequests.length === 0 ? (
                  <EmptyState
                    icon={<CalendarDays size={20} />}
                    title="No requests yet"
                    body="When you apply for leave it'll show up here with its approval trail."
                    action={
                      <Link href="/apply" className="btn btn-primary">
                        Apply for leave
                      </Link>
                    }
                  />
                ) : (
                  <div className="divide-line">
                    {myRequests.map((r) => (
                      <RequestRow
                        key={r.id}
                        request={{
                          id: r.id,
                          code: r.code,
                          leaveType: r.leaveType,
                          status: r.status,
                          startDate: dayKey(r.startDate),
                          endDate: dayKey(r.endDate),
                          chargedDays: r.chargedDays,
                          reason: r.reason,
                          appliedAt: r.appliedAt.toISOString(),
                          halfDay: r.halfDay,
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── right rail ──────────────────────────────────────────────── */}
          <div className="space-y-5">
            <div className="card p-5">
              <SectionHeader
                eyebrow={user.departmentName ?? "Your team"}
                title={
                  awayToday.length === 0
                    ? "Everyone's in today"
                    : `${awayToday.length} away today`
                }
                action={
                  <Link
                    href="/calendar"
                    className="text-[12px] font-bold"
                    style={{ color: "var(--brand-500)" }}
                  >
                    Calendar
                  </Link>
                }
              />
              {awayList.length === 0 ? (
                <p className="mt-4 text-[13px]" style={{ color: "var(--c-ink-500)" }}>
                  No one in {user.departmentName ?? "your team"} has approved leave in the next
                  fortnight.
                </p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {awayList.slice(0, 5).map((p, i) => {
                    const start = p.days[0];
                    const end = p.days[p.days.length - 1];
                    const isToday = p.days.includes(today);
                    return (
                      <li key={i} className="flex items-center gap-3">
                        <Avatar name={p.name} hue={p.avatarHue} size={34} />
                        <div className="min-w-0 flex-1">
                          <p
                            className="truncate text-[13px] font-bold"
                            style={{ color: "var(--c-ink-900)" }}
                          >
                            {p.name}
                          </p>
                          <p className="truncate text-[11.5px]" style={{ color: "var(--c-ink-500)" }}>
                            {fmtRange(start, end)}
                          </p>
                        </div>
                        <span
                          className="chip shrink-0"
                          style={{
                            background: leaveTint(p.type),
                            color: leaveInk(p.type),
                            fontSize: 10.5,
                            padding: "3px 8px",
                          }}
                        >
                          {isToday ? "Away now" : relativeDays(start)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="card p-5">
              <SectionHeader eyebrow="Company calendar" title="Next holidays" />
              <ul className="mt-4 space-y-3">
                {nextHolidays.map((h) => {
                  const k = dayKey(h.date);
                  return (
                    <li key={h.id} className="flex items-center gap-3.5">
                      <div
                        className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl"
                        style={{ background: "var(--lt-mat-tint)", color: "var(--lt-mat)" }}
                      >
                        <span className="text-[15px] font-extrabold leading-none tnum">
                          {Number(k.slice(8, 10))}
                        </span>
                        <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wider">
                          {fmtDateShort(k).split(" ")[1]}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate text-[13px] font-bold"
                          style={{ color: "var(--c-ink-900)" }}
                        >
                          {h.name}
                        </p>
                        <p className="text-[11.5px]" style={{ color: "var(--c-ink-500)" }}>
                          {relativeDays(k)} · {h.type === "NATIONAL" ? "National holiday" : "Declared holiday"}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div
                className="mt-4 rounded-xl px-3.5 py-3"
                style={{ background: "var(--c-info-tint)" }}
              >
                <p className="text-[11.5px] leading-snug" style={{ color: "var(--c-info-ink)" }}>
                  <strong>Worth knowing.</strong> If you take leave immediately before and after a
                  holiday or weekend, the days in between count as leave too (§8).
                </p>
              </div>
            </div>

            {expiringComp.length > 0 && (
              <div className="card p-5">
                <SectionHeader eyebrow="Earned" title="Comp-off in hand" />
                <ul className="mt-4 space-y-2.5">
                  {expiringComp.slice(0, 4).map((c) => {
                    const exp = dayKey(c.expiresAt);
                    const left = diffDays(today, exp);
                    return (
                      <li
                        key={c.id}
                        className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5"
                        style={{ background: "var(--c-surface-3)" }}
                      >
                        <div className="min-w-0">
                          <p className="text-[12.5px] font-bold" style={{ color: "var(--c-ink-900)" }}>
                            Worked {fmtDate(dayKey(c.workedDate))}
                          </p>
                          <p className="text-[11px]" style={{ color: "var(--c-ink-500)" }}>
                            Expires {fmtDate(exp)}
                          </p>
                        </div>
                        <Chip tone={left <= 7 ? "danger" : left <= 14 ? "warning" : "success"} size="sm">
                          {left}d left
                        </Chip>
                      </li>
                    );
                  })}
                </ul>
                <Link
                  href="/comp-off"
                  className="btn btn-ghost mt-4 w-full"
                  style={{ padding: "8px 14px" }}
                >
                  Manage comp-off
                </Link>
              </div>
            )}
          </div>
        </section>
      </PageBody>
    </>
  );
}
