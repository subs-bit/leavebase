import Link from "next/link";
import {
  ArrowRight, BarChart3, CalendarDays, Plane, ShieldCheck, TriangleAlert, Users,
} from "lucide-react";
import { db } from "@/lib/db";
import { PageBody, PageHeader } from "@/components/PageHeader";
import { RequestRow } from "@/components/RequestRow";
import {
  Avatar, Chip, EmptyState, SectionHeader, leaveInk, leaveTint,
} from "@/components/ui/primitives";
import {
  addDaysKey, dayKey, fmtDate, fmtDays, fmtRange, relativeDays, todayKey,
} from "@/lib/date";
import { getPolicy } from "@/lib/services/context";
import { leaveYearOf } from "@/lib/policy/leave-year";
import { LEAVE_META } from "@/lib/policy/types";
import type { SessionUser } from "@/lib/auth";

/**
 * A founder holds no leave of their own, so the employee dashboard would show them four empty
 * rings and an empty request list. This is the same page reframed around the company: who is out,
 * what is waiting on someone, and anything that needs a decision.
 */
export async function FounderDashboard({ user }: { user: SessionUser }) {
  const today = todayKey();
  const cfg = await getPolicy();
  const ly = leaveYearOf(today, cfg);
  const fortnight = addDaysKey(today, 13);

  const [staffCount, awayDays, pendingRequests, recentRequests, flags, holidays] = await Promise.all([
    db.user.count({ where: { isActive: true, role: { not: "FOUNDER" } } }),
    db.leaveRequestDay.findMany({
      where: {
        charged: { gt: 0 },
        date: {
          gte: new Date(`${today}T00:00:00.000Z`),
          lte: new Date(`${fortnight}T00:00:00.000Z`),
        },
        request: { status: "APPROVED" },
      },
      include: {
        request: {
          select: {
            leaveType: true,
            user: {
              select: {
                id: true, name: true, avatarHue: true, designation: true,
                department: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: { date: "asc" },
    }),
    db.leaveRequest.count({ where: { status: { in: ["PENDING", "PENDING_HOD"] } } }),
    db.leaveRequest.findMany({
      orderBy: { appliedAt: "desc" },
      take: 6,
      include: { user: { select: { name: true, avatarHue: true, designation: true } } },
    }),
    db.absenceFlag.findMany({
      where: { status: "OPEN" },
      include: { user: { select: { id: true, name: true, avatarHue: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.holiday.findMany({
      where: { date: { gte: new Date(`${today}T00:00:00.000Z`) } },
      orderBy: { date: "asc" },
      take: 3,
    }),
  ]);

  // Who is away, grouped by person
  const byPerson = new Map<
    string,
    { name: string; avatarHue: number; designation: string; dept: string; days: string[]; type: string }
  >();
  for (const d of awayDays) {
    const u = d.request.user;
    if (!byPerson.has(u.id)) {
      byPerson.set(u.id, {
        name: u.name, avatarHue: u.avatarHue, designation: u.designation,
        dept: u.department?.name ?? "—", days: [], type: d.request.leaveType,
      });
    }
    byPerson.get(u.id)!.days.push(dayKey(d.date));
  }
  const away = [...byPerson.values()].sort((a, b) => (a.days[0] < b.days[0] ? -1 : 1));
  const awayToday = away.filter((p) => p.days.includes(today));

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <>
      <PageHeader
        title={`${greeting}, ${user.name.split(" ")[0]}`}
        subtitle={`Company overview · leave year ${ly.label}`}
      />

      <PageBody className="space-y-6">
        <section className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
          <div
            className="prism-panel animate-in flex flex-col justify-between p-6 sm:p-7"
            style={{ borderRadius: 28, minHeight: 232, boxShadow: "var(--sh-glow)" }}
          >
            <div className="relative z-10">
              <p className="eyebrow" style={{ color: "rgba(255,255,255,.78)" }}>
                In today
              </p>
              <div className="mt-2.5 flex items-end gap-3">
                <span className="stat" style={{ fontSize: 54, color: "#fff", lineHeight: 0.95 }}>
                  {staffCount - awayToday.length}
                </span>
                <span
                  className="mb-1.5 text-[14px] font-semibold"
                  style={{ color: "rgba(255,255,255,.82)" }}
                >
                  of {staffCount} on the floor
                </span>
              </div>
              <p className="mt-2 text-[13px]" style={{ color: "rgba(255,255,255,.8)" }}>
                {awayToday.length === 0
                  ? "Nobody is on leave today."
                  : `${awayToday.map((p) => p.name.split(" ")[0]).slice(0, 4).join(", ")}${awayToday.length > 4 ? ` and ${awayToday.length - 4} more` : ""} away.`}
              </p>
            </div>

            <div className="relative z-10 mt-6 flex flex-wrap items-center gap-2.5">
              <Link
                href="/reports"
                className="btn"
                style={{ background: "#fff", color: "var(--brand-600)" }}
              >
                <BarChart3 size={15} />
                Reports
                <ArrowRight size={15} strokeWidth={2.6} />
              </Link>
              <Link
                href="/employees"
                className="chip"
                style={{ background: "rgba(255,255,255,.18)", color: "#fff", padding: "8px 14px" }}
              >
                <Users size={13} />
                {staffCount} employees
              </Link>
            </div>
          </div>

          <div className="card p-5 sm:p-6">
            <SectionHeader eyebrow="Right now" title="What needs attention" />
            <div className="mt-5 space-y-3">
              <Tile
                href="/approvals"
                label="Awaiting a decision"
                value={String(pendingRequests)}
                sub={pendingRequests === 0 ? "nothing outstanding" : "leave requests across all teams"}
                tone={pendingRequests > 0 ? "var(--c-warning-ink)" : "var(--c-ink-400)"}
                tint={pendingRequests > 0 ? "var(--c-warning-tint)" : "var(--c-ink-100)"}
                icon={<ShieldCheck size={16} />}
              />
              <Tile
                href="/employees"
                label="Unaccounted absence"
                value={String(flags.length)}
                sub={
                  flags.length === 0
                    ? "none flagged"
                    : flags.map((f) => f.user.name.split(" ")[0]).slice(0, 3).join(", ")
                }
                tone={flags.length > 0 ? "var(--c-danger-ink)" : "var(--c-ink-400)"}
                tint={flags.length > 0 ? "var(--c-danger-tint)" : "var(--c-ink-100)"}
                icon={<TriangleAlert size={16} />}
              />
              <Tile
                href="/calendar"
                label="Away in the next fortnight"
                value={String(away.length)}
                sub={away.length === 0 ? "clear diary" : "people with approved leave"}
                tone="var(--lt-pl)"
                tint="var(--lt-pl-tint)"
                icon={<Plane size={16} />}
              />
            </div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5">
              <SectionHeader eyebrow="Across the company" title="Latest requests" />
              <Link href="/approvals" className="text-[12px] font-bold" style={{ color: "var(--brand-500)" }}>
                See all
              </Link>
            </div>
            <div className="mt-4">
              {recentRequests.length === 0 ? (
                <EmptyState
                  icon={<CalendarDays size={20} />}
                  title="No leave requested yet"
                  body="Once your team starts applying, everything appears here."
                />
              ) : (
                <div className="divide-line">
                  {recentRequests.map((r) => (
                    <RequestRow
                      key={r.id}
                      showPerson
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
                        isLop: r.isLop,
                        lopDays: r.lopDays,
                        user: r.user,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-5">
            <div className="card p-5">
              <SectionHeader
                eyebrow="Next fortnight"
                title={away.length === 0 ? "Nobody out" : `${away.length} away`}
                action={
                  <Link href="/calendar" className="text-[12px] font-bold" style={{ color: "var(--brand-500)" }}>
                    Calendar
                  </Link>
                }
              />
              {away.length === 0 ? (
                <p className="mt-3 text-[13px]" style={{ color: "var(--c-ink-500)" }}>
                  No approved leave in the next two weeks.
                </p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {away.slice(0, 6).map((p, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <Avatar name={p.name} hue={p.avatarHue} size={34} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-bold" style={{ color: "var(--c-ink-900)" }}>
                          {p.name}
                        </p>
                        <p className="truncate text-[11.5px]" style={{ color: "var(--c-ink-500)" }}>
                          {p.dept} · {fmtRange(p.days[0], p.days[p.days.length - 1])}
                        </p>
                      </div>
                      <span
                        className="chip shrink-0"
                        style={{
                          background: leaveTint(p.type), color: leaveInk(p.type),
                          fontSize: 10.5, padding: "3px 8px",
                        }}
                      >
                        {p.days.includes(today) ? "Away now" : relativeDays(p.days[0])}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {holidays.length > 0 && (
              <div className="card p-5">
                <SectionHeader eyebrow="Company calendar" title="Next holidays" />
                <ul className="mt-4 space-y-3">
                  {holidays.map((h) => (
                    <li key={h.id} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-bold" style={{ color: "var(--c-ink-900)" }}>
                          {h.name}
                        </p>
                        <p className="text-[11.5px]" style={{ color: "var(--c-ink-500)" }}>
                          {fmtDate(dayKey(h.date))} · {relativeDays(dayKey(h.date))}
                        </p>
                      </div>
                      <Chip tone={h.type === "NATIONAL" ? "brand" : "neutral"} size="sm">
                        {h.type === "NATIONAL" ? "National" : "Declared"}
                      </Chip>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="card p-5" style={{ background: "var(--c-info-tint)", borderColor: "transparent" }}>
              <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--c-ink-700)" }}>
                <strong style={{ color: "var(--c-info-ink)" }}>You sit outside the policy.</strong>{" "}
                No leave accrues to you and you hold no balances, so you never appear in leave
                reporting or the headcount those figures are measured against. You can see every
                record and change anything, including overruling a decision a manager has already
                made — each such action is written to the audit log naming you.
              </p>
            </div>
          </div>
        </section>
      </PageBody>
    </>
  );
}

function Tile({
  href, label, value, sub, tone, tint, icon,
}: {
  href: string;
  label: string;
  value: string;
  sub: string;
  tone: string;
  tint: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="row-hover flex items-center gap-3.5 rounded-2xl px-4 py-3.5"
      style={{ background: tint }}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={{ background: "var(--c-surface)", color: tone }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="eyebrow block" style={{ color: tone }}>{label}</span>
        <span className="mt-0.5 block truncate text-[11.5px]" style={{ color: "var(--c-ink-500)" }}>
          {sub}
        </span>
      </span>
      <span className="stat shrink-0" style={{ fontSize: 26 }}>{value}</span>
    </Link>
  );
}
