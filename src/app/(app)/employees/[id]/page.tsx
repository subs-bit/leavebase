import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, MapPin, Pencil, Phone, TriangleAlert } from "lucide-react";
import { canViewUser, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageBody, PageHeader } from "@/components/PageHeader";
import { RequestRow } from "@/components/RequestRow";
import { BalanceRing } from "@/components/ui/BalanceRing";
import {
  Avatar, Chip, EmptyState, SectionHeader, leaveInk, leaveName,
} from "@/components/ui/primitives";
import {
  AdjustBalance, ConfirmEmployee, RecordAbsence, RecordExit, RecordLeaveTaken, ResolveFlag,
} from "./HrActions";
import { addDaysKey, dayKey, fmtDate, fmtDays, pluralDays, todayKey } from "@/lib/date";
import { getBalances, getCompOffAvailable, getPolicy } from "@/lib/services/context";
import { excessOnExit, leaveYearOf, toEligibility } from "@/lib/policy/leave-year";
import { isCredit, LEDGER_KIND_LABEL } from "@/lib/policy/balance";
import {
  BALANCE_TYPES, EMPLOYMENT_STATUS_LABEL, EMPLOYMENT_TYPE_LABEL, isHrOrAdmin, LEAVE_META, ROLE_LABEL,
} from "@/lib/policy/types";
import type { Role } from "@/lib/policy/types";

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const viewer = await requireUser();
  if (!(await canViewUser(viewer, id))) notFound();

  const emp = await db.user.findUnique({
    where: { id },
    include: {
      department: { select: { id: true, name: true } },
      manager: { select: { id: true, name: true, avatarHue: true, designation: true } },
      reports: { select: { id: true, name: true, avatarHue: true, designation: true }, where: { isActive: true } },
    },
  });
  if (!emp) notFound();

  const today = todayKey();
  const cfg = await getPolicy();
  const ly = leaveYearOf(today, cfg);
  const hr = isHrOrAdmin(viewer.role);

  const [balances, compAvailable, requests, ledger, flags] = await Promise.all([
    getBalances(emp.id, cfg, ly, today),
    getCompOffAvailable(emp.id, today),
    db.leaveRequest.findMany({
      where: { userId: emp.id },
      orderBy: { startDate: "desc" },
      take: 12,
    }),
    hr
      ? db.leaveLedger.findMany({
          where: { userId: emp.id, leaveYear: ly.label },
          orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
          take: 20,
        })
      : Promise.resolve([]),
    hr
      ? db.absenceFlag.findMany({ where: { userId: emp.id, status: "OPEN" }, orderBy: { createdAt: "desc" } })
      : Promise.resolve([]),
  ]);

  const eligibility = toEligibility(emp);
  const clExcess = excessOnExit("CL", eligibility, ly, cfg, balances.find((b) => b.leaveType === "CL")?.used ?? 0);
  const plExcess = excessOnExit("PL", eligibility, ly, cfg, balances.find((b) => b.leaveType === "PL")?.used ?? 0);

  return (
    <>
      <PageHeader
        title={emp.name}
        subtitle={`${emp.designation} · ${emp.empCode}`}
        actions={
          <>
            {hr && (
              <Link href={`/employees/${emp.id}/edit`} className="btn btn-ghost hidden sm:inline-flex">
                <Pencil size={14} />
                Edit
              </Link>
            )}
            <Link href={hr ? "/employees" : "/team"} className="btn btn-ghost hidden sm:inline-flex">
              <ArrowLeft size={15} />
              Back
            </Link>
          </>
        }
      />

      <PageBody className="space-y-5">
        {flags.length > 0 && (
          <section className="space-y-3">
            {flags.map((f) => (
              <div
                key={f.id}
                className="card p-5"
                style={{
                  background: f.severity === "ABSCONDING" ? "var(--c-danger-tint)" : "var(--c-warning-tint)",
                  borderColor: "transparent",
                }}
              >
                <div className="flex items-start gap-3">
                  <TriangleAlert
                    size={18}
                    style={{
                      color: f.severity === "ABSCONDING" ? "var(--c-danger-ink)" : "var(--c-warning-ink)",
                      marginTop: 2,
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-[14px] font-bold"
                      style={{ color: f.severity === "ABSCONDING" ? "var(--c-danger-ink)" : "var(--c-warning-ink)" }}
                    >
                      {f.severity === "ABSCONDING" ? "Possible absconding" : "Unaccounted absence"} —{" "}
                      {f.workingDays} working days
                    </p>
                    <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--c-ink-700)" }}>
                      {fmtDate(dayKey(f.fromDate))} to {fmtDate(dayKey(f.toDate))}. {f.note}
                    </p>
                    <ResolveFlag flagId={f.id} />
                  </div>
                </div>
              </div>
            ))}
          </section>
        )}

        <div className="grid gap-5 lg:grid-cols-[1fr_1.6fr] lg:items-start">
          {/* ── profile rail ────────────────────────────────────────────── */}
          <div className="space-y-5">
            <section className="card overflow-hidden">
              <div
                className="h-20"
                style={{
                  background: `linear-gradient(135deg, hsl(${emp.avatarHue} 84% 88%), hsl(${(emp.avatarHue + 45) % 360} 80% 84%))`,
                }}
              />
              <div className="px-5 pb-5">
                <div className="-mt-9 mb-3">
                  <Avatar name={emp.name} hue={emp.avatarHue} size={72} ring />
                </div>
                <h2 className="text-[18px]">{emp.name}</h2>
                <p className="text-[13px]" style={{ color: "var(--c-ink-500)" }}>
                  {emp.designation}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Chip
                    tone={
                      emp.status === "CONFIRMED" ? "success"
                      : emp.status === "PROBATION" ? "warning"
                      : emp.status === "RESIGNED" ? "danger" : "neutral"
                    }
                    size="sm"
                  >
                    {EMPLOYMENT_STATUS_LABEL[emp.status]}
                  </Chip>
                  <Chip tone="neutral" size="sm">{EMPLOYMENT_TYPE_LABEL[emp.employmentType]}</Chip>
                  <Chip tone="brand" size="sm">{ROLE_LABEL[emp.role as Role]}</Chip>
                </div>

                <dl className="mt-5 space-y-3">
                  <Row icon={<Mail size={13} />} value={emp.email} />
                  {emp.phone && <Row icon={<Phone size={13} />} value={emp.phone} />}
                  <Row icon={<MapPin size={13} />} value={emp.location} />
                </dl>

                <dl className="mt-5 grid grid-cols-2 gap-4 border-t pt-4" style={{ borderColor: "var(--c-border)" }}>
                  <Field label="Employee code" value={emp.empCode} />
                  <Field label="Department" value={emp.department?.name ?? "—"} />
                  <Field label="Joined" value={fmtDate(dayKey(emp.joinDate))} />
                  <Field
                    label="Confirmed"
                    value={emp.confirmDate ? fmtDate(dayKey(emp.confirmDate)) : "On probation"}
                  />
                  {emp.lastWorkingDay && (
                    <Field label="Last working day" value={fmtDate(dayKey(emp.lastWorkingDay))} />
                  )}
                </dl>

                {emp.manager && (
                  <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--c-border)" }}>
                    <p className="eyebrow mb-2.5">Reports to</p>
                    <Link href={`/employees/${emp.manager.id}`} className="flex items-center gap-3">
                      <Avatar name={emp.manager.name} hue={0} size={32} />
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] font-bold" style={{ color: "var(--c-ink-900)" }}>
                          {emp.manager.name}
                        </p>
                        <p className="truncate text-[11px]" style={{ color: "var(--c-ink-400)" }}>
                          {emp.manager.designation}
                        </p>
                      </div>
                    </Link>
                  </div>
                )}

                {emp.reports.length > 0 && (
                  <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--c-border)" }}>
                    <p className="eyebrow mb-2.5">{emp.reports.length} direct reports</p>
                    <div className="flex flex-wrap gap-2">
                      {emp.reports.map((r) => (
                        <Link key={r.id} href={`/employees/${r.id}`} title={r.name}>
                          <Avatar name={r.name} hue={r.avatarHue} size={30} />
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            {hr && (emp.status === "PROBATION" || emp.status === "CONFIRMED") && (
              <section className="card p-5">
                <SectionHeader
                  eyebrow="HR actions"
                  title={emp.status === "PROBATION" ? "Confirm employment" : "Record an exit"}
                />
                <div className="mt-4">
                  {emp.status === "PROBATION" ? (
                    <ConfirmEmployee userId={emp.id} suggested={addDaysKey(dayKey(emp.joinDate), 180)} />
                  ) : (
                    <RecordExit userId={emp.id} />
                  )}
                </div>
              </section>
            )}

            {hr && emp.isActive && (
              <section className="card p-5">
                <SectionHeader eyebrow="§12 · §13" title="Unauthorised absence" />
                <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: "var(--c-ink-500)" }}>
                  LeaveBase has no attendance feed, so absence is recorded here rather than guessed
                  from missing leave.
                </p>
                <div className="mt-4">
                  <RecordAbsence userId={emp.id} />
                </div>
              </section>
            )}
          </div>

          {/* ── main ────────────────────────────────────────────────────── */}
          <div className="space-y-5">
            <section className="card p-5">
              <SectionHeader eyebrow={`Leave year ${ly.label}`} title="Balances" />
              <div className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-4">
                {BALANCE_TYPES.map((t, i) => {
                  const b = balances.find((x) => x.leaveType === t)!;
                  const available = t === "COMP_OFF" ? compAvailable : b.available;
                  const notEligible = t === "PL" && emp.status === "PROBATION";
                  return (
                    <BalanceRing
                      key={t}
                      available={notEligible ? 0 : available}
                      granted={notEligible ? 1 : Math.max(b.granted, available, 1)}
                      color={leaveInk(t)}
                      label={LEAVE_META[t].name.replace(" Leave", "")}
                      sublabel={notEligible ? "On confirmation" : `${fmtDays(b.used)} used`}
                      size={100}
                      stroke={8}
                      delay={i * 80}
                    />
                  );
                })}
              </div>

              {(clExcess > 0 || plExcess > 0) && emp.status === "RESIGNED" && (
                <div
                  className="mt-5 rounded-xl px-4 py-3"
                  style={{ background: "var(--c-warning-tint)" }}
                >
                  <p className="text-[12.5px] font-bold" style={{ color: "var(--c-warning-ink)" }}>
                    Recoverable in full &amp; final settlement (§17)
                  </p>
                  <p className="mt-0.5 text-[12px]" style={{ color: "var(--c-warning-ink)" }}>
                    {clExcess > 0 && `${pluralDays(clExcess)} of Casual Leave`}
                    {clExcess > 0 && plExcess > 0 && " and "}
                    {plExcess > 0 && `${pluralDays(plExcess)} of Privileged Leave`} availed beyond the
                    pro-rata entitlement to the last working day.
                  </p>
                </div>
              )}
            </section>

            {hr && emp.isActive && emp.role !== "FOUNDER" && (
              <section className="card p-5">
                <SectionHeader
                  eyebrow="History"
                  title="Record leave already taken"
                />
                <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: "var(--c-ink-500)" }}>
                  For leave taken before LeaveBase existed, or a day nobody filed at the time. It is
                  deducted from the balance exactly as a normal request would be.
                </p>
                <div className="mt-4">
                  <RecordLeaveTaken userId={emp.id} name={emp.name} />
                </div>
              </section>
            )}

            {hr && (
              <section className="card p-5">
                <SectionHeader eyebrow="Correction" title="Adjust a balance" />
                <div className="mt-4">
                  <AdjustBalance userId={emp.id} />
                </div>
              </section>
            )}

            <section className="card overflow-hidden">
              <div className="px-5 pt-5">
                <SectionHeader eyebrow="History" title="Leave requests" />
              </div>
              {requests.length === 0 ? (
                <EmptyState title="No requests on record" />
              ) : (
                <div className="mt-4 divide-line">
                  {requests.map((r) => (
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
            </section>

            {hr && ledger.length > 0 && (
              <section className="card overflow-hidden">
                <div className="px-5 pt-5">
                  <SectionHeader eyebrow="Audit-grade record" title="Balance ledger" />
                </div>
                <div className="mt-4 divide-line">
                  {ledger.map((e) => (
                    <div key={e.id} className="flex items-center gap-3.5 px-5 py-3">
                      <span
                        className="w-[92px] shrink-0 text-[11.5px] font-semibold"
                        style={{ color: "var(--c-ink-400)" }}
                      >
                        {fmtDate(dayKey(e.effectiveDate))}
                      </span>
                      <span
                        className="w-[74px] shrink-0 text-[11.5px] font-bold"
                        style={{ color: leaveInk(e.leaveType) }}
                      >
                        {leaveName(e.leaveType).replace(" Leave", "")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] font-bold" style={{ color: "var(--c-ink-900)" }}>
                          {LEDGER_KIND_LABEL[e.entryKind] ?? e.entryKind}
                        </p>
                        {e.note && (
                          <p className="truncate text-[11px]" style={{ color: "var(--c-ink-500)" }}>
                            {e.note}
                          </p>
                        )}
                      </div>
                      <span
                        className="shrink-0 text-[13px] font-extrabold tnum"
                        style={{ color: isCredit(e.entryKind) ? "var(--c-success-ink)" : "var(--c-ink-900)" }}
                      >
                        {e.amount > 0 ? "+" : ""}
                        {fmtDays(e.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </PageBody>
    </>
  );
}

function Row({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span style={{ color: "var(--c-ink-400)" }}>{icon}</span>
      <span className="truncate text-[12.5px]" style={{ color: "var(--c-ink-700)" }}>
        {value}
      </span>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="eyebrow mb-1">{label}</dt>
      <dd className="text-[12.5px] font-bold" style={{ color: "var(--c-ink-900)" }}>
        {value}
      </dd>
    </div>
  );
}
