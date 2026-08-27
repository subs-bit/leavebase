import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, CheckCircle2, Phone, ShieldCheck, User2 } from "lucide-react";
import { canViewUser, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageBody, PageHeader } from "@/components/PageHeader";
import { ApprovalTimeline } from "@/components/ApprovalTimeline";
import { CancelPanel, DecisionPanel, DeletePanel, ReassignPanel } from "@/components/DecisionPanel";
import {
  Avatar, Chip, leaveInk, leaveTint, LeaveChip, PolicyNote, SectionHeader, StatusChip,
} from "@/components/ui/primitives";
import {
  dayKey, fmtDate, fmtDateFull, fmtDateTime, fmtDays, fmtRange, pluralDays, relativeDays, todayKey,
} from "@/lib/date";
import { HALF_DAY_LABEL, LEAVE_META, NON_CLUBBABLE, isAdministrator, isHrOrAdmin } from "@/lib/policy/types";
import type { LeaveType } from "@/lib/policy/types";
import type { Finding } from "@/lib/policy/evaluate";
import { getBalances, getPolicy } from "@/lib/services/context";
import { leaveYearOf } from "@/lib/policy/leave-year";

export default async function RequestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ applied?: string }>;
}) {
  const { id } = await params;
  const { applied } = await searchParams;
  const viewer = await requireUser();

  const request = await db.leaveRequest.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true, name: true, avatarHue: true, designation: true, empCode: true,
          email: true, status: true, joinDate: true, confirmDate: true, lastWorkingDay: true,
          department: { select: { name: true } },
        },
      },
      days: { orderBy: { date: "asc" } },
      approvals: {
        orderBy: { level: "asc" },
        include: { approver: { select: { name: true, avatarHue: true, designation: true } } },
      },
    },
  });

  if (!request) notFound();
  if (!(await canViewUser(viewer, request.userId))) notFound();

  const meta = LEAVE_META[request.leaveType as keyof typeof LEAVE_META];
  const today = todayKey();
  const start = dayKey(request.startDate);
  const end = dayKey(request.endDate);
  const isOwn = request.userId === viewer.id;
  const isOpen = ["PENDING", "PENDING_HOD"].includes(request.status);

  const myStep = request.approvals
    .filter((a) => a.action === "PENDING")
    .sort((a, b) => a.level - b.level)[0];
  const canDecide =
    isOpen && !!myStep && (myStep.approverId === viewer.id || isHrOrAdmin(viewer.role));
  const canCancel =
    (isOwn && (isOpen || (request.status === "APPROVED" && start > today))) ||
    (request.status === "APPROVED" &&
      (request.approvals.some((a) => a.approverId === viewer.id) || isHrOrAdmin(viewer.role)));
  const canReassign =
    isAdministrator(viewer.role) &&
    request.status === "APPROVED" &&
    NON_CLUBBABLE.includes(request.leaveType as LeaveType);
  const canDelete = isAdministrator(viewer.role);

  const snapshot = safeJson(request.policySnapshot);
  const findings: Finding[] = Array.isArray(snapshot.findings) ? (snapshot.findings as Finding[]) : [];
  const notableFindings = findings.filter((f) => f.level !== "INFO");

  // Balance context for the approver — §18 asks them to check it before deciding.
  const cfg = await getPolicy();
  const ly = leaveYearOf(start, cfg);
  const balances = canDecide || !isOwn ? await getBalances(request.userId, cfg, ly, today) : [];
  const typeBalance = balances.find((b) => b.leaveType === request.leaveType);

  const chargedDayLines = request.days.filter((d) => d.charged > 0);
  const sandwiched = chargedDayLines.filter((d) => d.dayType !== "WORKING");

  return (
    <>
      <PageHeader
        title={meta.name}
        subtitle={`${request.code} · ${fmtRange(start, end)}`}
        actions={
          <Link href={isOwn ? "/requests" : "/approvals"} className="btn btn-ghost hidden sm:inline-flex">
            <ArrowLeft size={15} />
            Back
          </Link>
        }
      />

      <PageBody className="space-y-5">
        {applied === "1" && (
          <div
            className="animate-in flex items-start gap-3 rounded-2xl px-4 py-3.5"
            style={{ background: "var(--c-success-tint)" }}
          >
            <CheckCircle2 size={17} style={{ color: "var(--c-success-ink)", marginTop: 1 }} />
            <div>
              <p className="text-[13.5px] font-bold" style={{ color: "var(--c-success-ink)" }}>
                Request submitted
              </p>
              <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--c-success-ink)" }}>
                {request.approvals[0]?.approver.name ?? "Your approver"} has been notified. You'll
                get a notification the moment there's a decision.
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr] lg:items-start">
          {/* ── left ─────────────────────────────────────────────────────── */}
          <div className="space-y-5">
            {/* summary card */}
            <section className="card overflow-hidden">
              <div
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                style={{ background: leaveTint(request.leaveType) }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-[13px] font-extrabold"
                    style={{ background: leaveInk(request.leaveType), color: "#fff" }}
                  >
                    {meta.short}
                  </span>
                  <div>
                    <p className="text-[15px] font-extrabold" style={{ color: leaveInk(request.leaveType) }}>
                      {fmtDays(request.chargedDays)} {request.chargedDays === 1 ? "day" : "days"}
                    </p>
                    <p className="text-[12px]" style={{ color: "var(--c-ink-500)" }}>
                      {fmtRange(start, end)}
                      {request.halfDay !== "NONE" && ` · ${HALF_DAY_LABEL[request.halfDay as "FIRST_HALF"]}`}
                    </p>
                  </div>
                </div>
                <StatusChip status={request.status} />
              </div>

              <dl className="grid grid-cols-2 gap-x-5 gap-y-4 p-5 sm:grid-cols-4">
                <Field label="Applied" value={fmtDate(dayKey(request.appliedAt))} />
                <Field
                  label="Notice given"
                  value={request.noticeDays < 0 ? "Retrospective" : `${request.noticeDays} days`}
                />
                <Field label="Calendar days" value={String(request.calendarDays)} />
                <Field
                  label="Deducted"
                  value={`${fmtDays(request.chargedDays)}${request.lopDays > 0 ? ` (${fmtDays(request.lopDays)} LOP)` : ""}`}
                />
              </dl>

              <div className="border-t px-5 py-4" style={{ borderColor: "var(--c-border)" }}>
                <p className="eyebrow mb-1.5">Reason given</p>
                <p className="text-[13.5px] leading-relaxed" style={{ color: "var(--c-ink-700)" }}>
                  {request.reason}
                </p>
                {request.contactInfo && (
                  <p className="mt-3 flex items-center gap-2 text-[12.5px]" style={{ color: "var(--c-ink-500)" }}>
                    <Phone size={13} />
                    Reachable on {request.contactInfo}
                  </p>
                )}
              </div>
            </section>

            {/* day breakdown */}
            <section className="card p-5">
              <SectionHeader
                eyebrow="What gets deducted"
                title="Day by day"
                action={
                  sandwiched.length > 0 ? (
                    <Chip tone="warning" size="sm">
                      {sandwiched.length} non-working {sandwiched.length === 1 ? "day" : "days"} charged
                    </Chip>
                  ) : undefined
                }
              />
              <ul className="mt-4 space-y-1">
                {request.days.map((d) => {
                  const k = dayKey(d.date);
                  return (
                    <li
                      key={d.id}
                      className="flex items-center gap-3 rounded-xl px-3 py-2"
                      style={{
                        background: d.charged > 0 ? "var(--c-surface-3)" : "transparent",
                      }}
                    >
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{
                          background: d.charged > 0 ? leaveInk(request.leaveType) : "var(--c-ink-200)",
                        }}
                      />
                      <span
                        className="w-[132px] shrink-0 text-[12.5px] font-semibold"
                        style={{ color: d.charged > 0 ? "var(--c-ink-900)" : "var(--c-ink-400)" }}
                      >
                        {fmtDateFull(k)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[11.5px]" style={{ color: "var(--c-ink-500)" }}>
                        {d.reason || (d.dayType === "WORKING" ? "Working day" : d.label)}
                      </span>
                      <span
                        className="shrink-0 text-[12.5px] font-extrabold tnum"
                        style={{ color: d.charged > 0 ? "var(--c-ink-900)" : "var(--c-ink-400)" }}
                      >
                        {d.charged > 0 ? fmtDays(d.charged) : "—"}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {sandwiched.length > 0 && (
                <div className="mt-4">
                  <PolicyNote level="INFO" title="Intervening holidays and weekly offs" clause="§8">
                    Leave taken immediately before and after a weekly off or declared holiday absorbs
                    the days in between, and they come out of the leave balance.
                  </PolicyNote>
                </div>
              )}
            </section>

            {/* policy findings recorded at submission */}
            {notableFindings.length > 0 && (
              <section className="card p-5">
                <SectionHeader
                  eyebrow="Recorded at submission"
                  title="Policy notes"
                />
                <div className="mt-4 space-y-2.5">
                  {notableFindings.map((f, i) => (
                    <PolicyNote key={i} level={f.level} title={f.title} clause={f.clause}>
                      {f.detail}
                    </PolicyNote>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* ── right ────────────────────────────────────────────────────── */}
          <div className="space-y-5">
            {/* who */}
            <section className="card p-5">
              <p className="eyebrow mb-3.5">Requested by</p>
              <div className="flex items-center gap-3.5">
                <Avatar name={request.user.name} hue={request.user.avatarHue} size={46} />
                <div className="min-w-0">
                  <p className="text-[14.5px] font-bold" style={{ color: "var(--c-ink-900)" }}>
                    {request.user.name}
                  </p>
                  <p className="truncate text-[12px]" style={{ color: "var(--c-ink-500)" }}>
                    {request.user.designation}
                  </p>
                  <p className="mt-0.5 text-[11.5px]" style={{ color: "var(--c-ink-400)" }}>
                    {request.user.empCode} · {request.user.department?.name ?? "—"}
                  </p>
                </div>
              </div>
              {!isOwn && (
                <Link
                  href={`/employees/${request.user.id}`}
                  className="btn btn-ghost mt-4 w-full"
                  style={{ padding: "8px 14px" }}
                >
                  <User2 size={14} />
                  View full record
                </Link>
              )}
            </section>

            {/* decision-support: what §18 asks approvers to check */}
            {canDecide && typeBalance && (
              <section className="card p-5">
                <p className="eyebrow mb-3.5">Before you decide</p>
                <ul className="space-y-3">
                  <CheckLine
                    label="Balance"
                    value={`${fmtDays(typeBalance.available)} of ${meta.name} available`}
                    tone={typeBalance.available >= request.chargedDays ? "ok" : "warn"}
                  />
                  <CheckLine
                    label="Notice"
                    value={
                      request.noticeDays < 0
                        ? "Applied retrospectively"
                        : `${request.noticeDays} days ahead of the first day`
                    }
                    tone={request.noticeDays >= 0 ? "ok" : "warn"}
                  />
                  <CheckLine
                    label="Starts"
                    value={`${relativeDays(start)} — ${fmtDate(start)}`}
                    tone="ok"
                  />
                  {request.lopDays > 0 && (
                    <CheckLine
                      label="Loss of pay"
                      value={`${pluralDays(request.lopDays)} unpaid if approved (§13)`}
                      tone="warn"
                    />
                  )}
                </ul>
              </section>
            )}

            {/* actions */}
            {(canDecide || canCancel || canReassign || canDelete) && (
              <section className="card p-5">
                <p className="eyebrow mb-3.5">
                  {canDecide ? "Your decision" : isOwn ? "Change of plan" : "Manage"}
                </p>
                {canDecide ? (
                  <DecisionPanel requestId={request.id} />
                ) : canCancel ? (
                  <CancelPanel
                    requestId={request.id}
                    mode={isOwn && isOpen ? "withdraw" : "cancel"}
                  />
                ) : null}
                {canDecide && canCancel && (
                  <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--c-border)" }}>
                    <CancelPanel requestId={request.id} mode="cancel" />
                  </div>
                )}
                {canReassign && (
                  <div
                    className={(canDecide || canCancel) ? "mt-4 border-t pt-4" : ""}
                    style={(canDecide || canCancel) ? { borderColor: "var(--c-border)" } : undefined}
                  >
                    <ReassignPanel requestId={request.id} currentType={request.leaveType as LeaveType} />
                  </div>
                )}
                {canDelete && (
                  <div
                    className={(canDecide || canCancel || canReassign) ? "mt-4 border-t pt-4" : ""}
                    style={(canDecide || canCancel || canReassign) ? { borderColor: "var(--c-border)" } : undefined}
                  >
                    <DeletePanel requestId={request.id} />
                  </div>
                )}
              </section>
            )}

            {/* timeline */}
            <section className="card p-5">
              <p className="eyebrow mb-4">Approval trail</p>
              <ApprovalTimeline
                submitted={{
                  at: request.appliedAt.toISOString(),
                  by: { name: request.user.name, avatarHue: request.user.avatarHue },
                }}
                steps={request.approvals.map((a) => ({
                  id: a.id,
                  level: a.level,
                  levelLabel: a.levelLabel,
                  action: a.action,
                  comment: a.comment,
                  actedAt: a.actedAt ? a.actedAt.toISOString() : null,
                  approver: a.approver,
                }))}
                closing={
                  ["CANCELLED", "WITHDRAWN"].includes(request.status) && request.decidedAt
                    ? {
                        label: request.status === "WITHDRAWN" ? "Withdrawn" : "Cancelled",
                        at: request.decidedAt.toISOString(),
                        note: request.cancelReason || undefined,
                      }
                    : undefined
                }
              />
            </section>
          </div>
        </div>
      </PageBody>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="eyebrow mb-1">{label}</dt>
      <dd className="text-[13.5px] font-bold" style={{ color: "var(--c-ink-900)" }}>
        {value}
      </dd>
    </div>
  );
}

function CheckLine({
  label, value, tone,
}: {
  label: string;
  value: string;
  tone: "ok" | "warn";
}) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: tone === "ok" ? "var(--c-success)" : "var(--c-warning)" }}
      />
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: "var(--c-ink-400)" }}>
          {label}
        </p>
        <p className="text-[12.5px] font-semibold" style={{ color: "var(--c-ink-700)" }}>
          {value}
        </p>
      </div>
    </li>
  );
}

function safeJson(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return {};
  }
}
