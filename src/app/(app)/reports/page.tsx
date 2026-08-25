import Link from "next/link";
import { Download, TrendingUp, TriangleAlert, Wallet } from "lucide-react";
import { requireHr } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageBody, PageHeader } from "@/components/PageHeader";
import { BarChart, Donut, RankedBars } from "@/components/Charts";
import {
  Avatar, Chip, EmptyState, SectionHeader, leaveInk, leaveName,
} from "@/components/ui/primitives";
import { dayKey, fmtDate, fmtDays, monthName, pluralDays, todayKey } from "@/lib/date";
import { getBalances, getPolicy } from "@/lib/services/context";
import { leaveYearOf, quartersOf } from "@/lib/policy/leave-year";
import { BALANCE_TYPES, LEAVE_META } from "@/lib/policy/types";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  await requireHr();

  const today = todayKey();
  const cfg = await getPolicy();
  const ly = leaveYearOf(today, cfg);

  const [employees, approvedDays, requests, departments, lopRequests] = await Promise.all([
    db.user.findMany({
      // Founders sit outside the policy: counting them would understate average leave taken and
      // overstate headcount against liability.
      where: { isActive: true, role: { not: "FOUNDER" } },
      select: {
        id: true, name: true, avatarHue: true, designation: true, status: true,
        departmentId: true, department: { select: { name: true } },
      },
    }),
    db.leaveRequestDay.findMany({
      where: {
        charged: { gt: 0 },
        request: { status: "APPROVED" },
        date: {
          gte: new Date(`${ly.start}T00:00:00.000Z`),
          lte: new Date(`${ly.end}T00:00:00.000Z`),
        },
      },
      include: {
        request: {
          select: { leaveType: true, userId: true, user: { select: { departmentId: true } } },
        },
      },
    }),
    db.leaveRequest.findMany({
      where: { appliedAt: { gte: new Date(`${ly.start}T00:00:00.000Z`) } },
      select: { status: true, appliedAt: true, decidedAt: true, leaveType: true },
    }),
    db.department.findMany({ orderBy: { name: "asc" } }),
    db.leaveRequest.findMany({
      where: { isLop: true, lopDays: { gt: 0 } },
      include: { user: { select: { id: true, name: true, avatarHue: true, department: { select: { name: true } } } } },
      orderBy: { startDate: "desc" },
      take: 20,
    }),
  ]);

  // ── aggregate ───────────────────────────────────────────────────────────────
  const byType = new Map<string, number>();
  const byDept = new Map<string, number>();
  const byMonth = new Map<number, number>();
  const byPerson = new Map<string, number>();

  for (const d of approvedDays) {
    byType.set(d.request.leaveType, (byType.get(d.request.leaveType) ?? 0) + d.charged);
    const dept = d.request.user.departmentId ?? "none";
    byDept.set(dept, (byDept.get(dept) ?? 0) + d.charged);
    const m = Number(dayKey(d.date).slice(5, 7)) - 1;
    byMonth.set(m, (byMonth.get(m) ?? 0) + d.charged);
    byPerson.set(d.request.userId, (byPerson.get(d.request.userId) ?? 0) + d.charged);
  }

  const totalDays = [...byType.values()].reduce((s, n) => s + n, 0);
  const totalLop = lopRequests.reduce((s, r) => s + r.lopDays, 0);
  const pendingNow = requests.filter((r) => ["PENDING", "PENDING_HOD"].includes(r.status)).length;
  const rejected = requests.filter((r) => r.status === "REJECTED").length;
  const decided = requests.filter((r) => r.decidedAt);
  const avgDecisionHours =
    decided.length > 0
      ? decided.reduce((s, r) => s + (r.decidedAt!.getTime() - r.appliedAt.getTime()), 0) /
        decided.length /
        3_600_000
      : 0;

  // §6 PL liability — the days the company owes as unused Privileged Leave.
  const allBalances = await Promise.all(
    employees.map(async (e) => ({ e, b: await getBalances(e.id, cfg, ly, today) })),
  );
  const plLiability = allBalances.reduce(
    (s, x) => s + (x.b.find((y) => y.leaveType === "PL")?.available ?? 0),
    0,
  );
  const clAtRisk = allBalances.reduce(
    (s, x) => s + (x.b.find((y) => y.leaveType === "CL")?.available ?? 0),
    0,
  );
  const nearCap = allBalances.filter(
    (x) => (x.b.find((y) => y.leaveType === "PL")?.available ?? 0) >= cfg.plAccumulationCap - 3,
  );

  // FY month order: Apr → Mar
  const fyMonths = Array.from({ length: 12 }, (_, i) => (3 + i) % 12);

  const typeSlices = BALANCE_TYPES.concat(["MATERNITY", "PATERNITY"] as never)
    .map((t) => ({
      label: LEAVE_META[t as keyof typeof LEAVE_META]?.name ?? t,
      value: byType.get(t) ?? 0,
      color: leaveInk(t),
    }))
    .filter((s) => s.value > 0);

  const deptBars = departments
    .map((d) => ({
      label: d.name,
      value: byDept.get(d.id) ?? 0,
      color: "var(--brand-400)",
      sub: `${employees.filter((e) => e.departmentId === d.id).length} people`,
    }))
    .sort((a, b) => b.value - a.value);

  const topTakers = [...byPerson.entries()]
    .map(([id, days]) => {
      const e = employees.find((x) => x.id === id);
      return { label: e?.name ?? "Unknown", value: days, color: "var(--lt-pl)", sub: e?.designation };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle={`Leave year ${ly.label} · ${employees.length} employees on the policy`}
        actions={
          <a href="/api/export/leave.csv" className="btn btn-ghost hidden sm:inline-flex">
            <Download size={15} />
            Export CSV
          </a>
        }
      />

      <PageBody className="space-y-5">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi
            label="Leave taken"
            value={fmtDays(totalDays)}
            unit="days"
            sub={`across ${byPerson.size} employees`}
            tint="var(--lt-pl-tint)"
            ink="var(--lt-pl)"
          />
          <Kpi
            label="Loss of pay"
            value={fmtDays(totalLop)}
            unit="days"
            sub={totalLop > 0 ? `${lopRequests.length} requests affected` : "none this year"}
            tint="var(--lt-lop-tint)"
            ink="var(--lt-lop)"
          />
          <Kpi
            label="Awaiting decision"
            value={String(pendingNow)}
            unit="requests"
            sub={`${rejected} rejected this year`}
            tint="var(--c-warning-tint)"
            ink="var(--c-warning-ink)"
          />
          <Kpi
            label="Median decision time"
            value={avgDecisionHours < 24 ? avgDecisionHours.toFixed(1) : (avgDecisionHours / 24).toFixed(1)}
            unit={avgDecisionHours < 24 ? "hours" : "days"}
            sub="§18 asks for prompt decisions"
            tint="var(--c-success-tint)"
            ink="var(--c-success-ink)"
          />
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <div className="card p-5">
            <SectionHeader eyebrow="Composition" title="Where the days go" />
            <div className="mt-5">
              {typeSlices.length === 0 ? (
                <EmptyState title="No approved leave yet this year" />
              ) : (
                <Donut
                  slices={typeSlices}
                  centerValue={fmtDays(totalDays)}
                  centerLabel="days"
                />
              )}
            </div>
          </div>

          <div className="card p-5">
            <SectionHeader eyebrow="Seasonality" title="Days taken by month" />
            <div className="mt-5">
              <BarChart
                bars={fyMonths.map((m) => ({
                  label: monthName(m, true),
                  value: byMonth.get(m) ?? 0,
                  color: (byMonth.get(m) ?? 0) > 0 ? "var(--brand-400)" : "var(--c-ink-200)",
                }))}
                height={168}
              />
              <p className="mt-3 text-[11.5px]" style={{ color: "var(--c-ink-400)" }}>
                Financial year, April through March (§3).
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <div className="card p-5">
            <SectionHeader eyebrow="By department" title="Leave distribution" />
            <div className="mt-5">
              {deptBars.every((d) => d.value === 0) ? (
                <EmptyState title="Nothing to compare yet" />
              ) : (
                <RankedBars bars={deptBars} />
              )}
            </div>
          </div>

          <div className="card p-5">
            <SectionHeader eyebrow="Individuals" title="Most leave taken" />
            <div className="mt-5">
              {topTakers.length === 0 ? (
                <EmptyState title="No leave recorded yet" />
              ) : (
                <RankedBars bars={topTakers} />
              )}
            </div>
          </div>
        </section>

        {/* liability */}
        <section className="card p-5">
          <SectionHeader
            eyebrow="§6 · §4"
            title="Leave liability and lapse exposure"
          />
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl p-4" style={{ background: "var(--lt-pl-tint)" }}>
              <Wallet size={17} style={{ color: "var(--lt-pl)" }} />
              <p className="stat mt-2.5" style={{ fontSize: 28 }}>{fmtDays(plLiability)}</p>
              <p className="text-[12px] font-bold" style={{ color: "var(--lt-pl)" }}>
                Privileged Leave outstanding
              </p>
              <p className="mt-1 text-[11.5px]" style={{ color: "var(--c-ink-500)" }}>
                Not encashable (§6) — this is a scheduling liability, not a financial one.
              </p>
            </div>
            <div className="rounded-2xl p-4" style={{ background: "var(--lt-cl-tint)" }}>
              <TrendingUp size={17} style={{ color: "var(--lt-cl)" }} />
              <p className="stat mt-2.5" style={{ fontSize: 28 }}>{fmtDays(clAtRisk)}</p>
              <p className="text-[12px] font-bold" style={{ color: "var(--lt-cl)" }}>
                Casual Leave lapsing {fmtDate(ly.end)}
              </p>
              <p className="mt-1 text-[11.5px]" style={{ color: "var(--c-ink-500)" }}>
                §4 — Casual Leave does not carry forward and is non-encashable.
              </p>
            </div>
            <div
              className="rounded-2xl p-4"
              style={{ background: nearCap.length ? "var(--c-warning-tint)" : "var(--c-ink-100)" }}
            >
              <TriangleAlert size={17} style={{ color: nearCap.length ? "var(--c-warning-ink)" : "var(--c-ink-400)" }} />
              <p className="stat mt-2.5" style={{ fontSize: 28 }}>{nearCap.length}</p>
              <p
                className="text-[12px] font-bold"
                style={{ color: nearCap.length ? "var(--c-warning-ink)" : "var(--c-ink-500)" }}
              >
                Near the {cfg.plAccumulationCap}-day PL ceiling
              </p>
              <p className="mt-1 text-[11.5px]" style={{ color: "var(--c-ink-500)" }}>
                {nearCap.length
                  ? nearCap.slice(0, 3).map((x) => x.e.name.split(" ")[0]).join(", ") +
                    (nearCap.length > 3 ? ` and ${nearCap.length - 3} more` : "") +
                    " risk losing days (§6)."
                  : "No one is close to the ceiling."}
              </p>
            </div>
          </div>
        </section>

        {/* LOP register */}
        <section className="card overflow-hidden">
          <div className="px-5 pt-5">
            <SectionHeader
              eyebrow="§13 Loss of Pay"
              title="LOP register"
              action={
                <a href="/api/export/lop.csv" className="text-[12px] font-bold" style={{ color: "var(--brand-500)" }}>
                  Export
                </a>
              }
            />
          </div>
          {lopRequests.length === 0 ? (
            <EmptyState
              title="No loss of pay recorded"
              body="Approved leave has stayed within balance across the organisation."
            />
          ) : (
            <div className="mt-4 divide-line">
              {lopRequests.map((r) => (
                <Link
                  key={r.id}
                  href={`/requests/${r.id}`}
                  className="row-hover flex items-center gap-3.5 px-5 py-3.5"
                >
                  <Avatar name={r.user.name} hue={r.user.avatarHue} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold" style={{ color: "var(--c-ink-900)" }}>
                      {r.user.name}
                      <span className="ml-2 text-[11.5px] font-semibold" style={{ color: "var(--c-ink-400)" }}>
                        {r.user.department?.name}
                      </span>
                    </p>
                    <p className="text-[12px]" style={{ color: "var(--c-ink-500)" }}>
                      {leaveName(r.leaveType)} · {fmtDate(dayKey(r.startDate))} · {r.code}
                    </p>
                  </div>
                  <Chip tone="warning" size="sm">{pluralDays(r.lopDays)} unpaid</Chip>
                </Link>
              ))}
            </div>
          )}
        </section>
      </PageBody>
    </>
  );
}

function Kpi({
  label, value, unit, sub, tint, ink,
}: {
  label: string;
  value: string;
  unit: string;
  sub: string;
  tint: string;
  ink: string;
}) {
  return (
    <div className="card p-5" style={{ background: tint, borderColor: "transparent" }}>
      <p className="eyebrow" style={{ color: ink }}>{label}</p>
      <p className="stat mt-2">
        <span style={{ fontSize: 32 }}>{value}</span>
        <span className="ml-1.5 text-[13px] font-bold" style={{ color: "var(--c-ink-500)" }}>
          {unit}
        </span>
      </p>
      <p className="mt-1 text-[11.5px]" style={{ color: "var(--c-ink-500)" }}>{sub}</p>
    </div>
  );
}
