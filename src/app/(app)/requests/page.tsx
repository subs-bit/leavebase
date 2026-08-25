import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, CalendarDays, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageBody, PageHeader } from "@/components/PageHeader";
import { RequestRow } from "@/components/RequestRow";
import { BalanceBar } from "@/components/ui/BalanceRing";
import {
  Chip, EmptyState, leaveInk, leaveName, SectionHeader,
} from "@/components/ui/primitives";
import { dayKey, fmtDate, fmtDays, todayKey } from "@/lib/date";
import { getBalances, getCompOffAvailable, getPolicy } from "@/lib/services/context";
import { isCredit, LEDGER_KIND_LABEL, sortLedger } from "@/lib/policy/balance";
import { accrualSchedule, leaveYearOf, toEligibility } from "@/lib/policy/leave-year";
import { BALANCE_TYPES, LEAVE_META } from "@/lib/policy/types";

export const metadata = { title: "My requests" };

const TABS = [
  { key: "all", label: "All" },
  { key: "open", label: "Awaiting decision" },
  { key: "approved", label: "Approved" },
  { key: "closed", label: "Closed" },
  { key: "balance", label: "Balance statement" },
];

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab = "all" } = await searchParams;
  const user = await requireUser();
  const today = todayKey();
  const cfg = await getPolicy();
  const ly = leaveYearOf(today, cfg);

  const statusFilter =
    tab === "open" ? ["PENDING", "PENDING_HOD"]
    : tab === "approved" ? ["APPROVED"]
    : tab === "closed" ? ["REJECTED", "CANCELLED", "WITHDRAWN"]
    : undefined;

  const [requests, balances, compAvailable, counts] = await Promise.all([
    db.leaveRequest.findMany({
      where: { userId: user.id, ...(statusFilter ? { status: { in: statusFilter } } : {}) },
      orderBy: { appliedAt: "desc" },
    }),
    getBalances(user.id, cfg, ly, today),
    getCompOffAvailable(user.id, today),
    db.leaveRequest.groupBy({
      by: ["status"],
      where: { userId: user.id },
      _count: true,
    }),
  ]);

  const openCount = counts
    .filter((c) => ["PENDING", "PENDING_HOD"].includes(c.status))
    .reduce((s, c) => s + c._count, 0);

  return (
    <>
      <PageHeader
        title="My requests"
        subtitle={`Leave year ${ly.label} · ${fmtDate(ly.start)} to ${fmtDate(ly.end)}`}
      />

      <PageBody className="space-y-5">
        <nav className="flex flex-wrap gap-2">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <Link
                key={t.key}
                href={`/requests?tab=${t.key}`}
                className="chip transition-colors"
                style={{
                  background: active ? "var(--lt-pl)" : "var(--c-surface)",
                  color: active ? "#fff" : "var(--c-ink-500)",
                  border: `1px solid ${active ? "var(--lt-pl)" : "var(--c-border)"}`,
                  padding: "7px 14px",
                  fontSize: 12.5,
                }}
              >
                {t.label}
                {t.key === "open" && openCount > 0 && (
                  <span
                    className="rounded-full px-1.5 text-[10px] font-extrabold"
                    style={{
                      background: active ? "rgba(255,255,255,.25)" : "var(--c-warning-tint)",
                      color: active ? "#fff" : "var(--c-warning-ink)",
                    }}
                  >
                    {openCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {tab === "balance" ? (
          <BalanceStatement
            userId={user.id}
            user={user}
            cfg={cfg}
            ly={ly}
            balances={balances}
            compAvailable={compAvailable}
          />
        ) : (
          <div className="card overflow-hidden">
            {requests.length === 0 ? (
              <EmptyState
                icon={<CalendarDays size={20} />}
                title="Nothing here"
                body={
                  tab === "all"
                    ? "You haven't applied for any leave in this leave year."
                    : "No requests match this filter."
                }
                action={
                  <Link href="/apply" className="btn btn-primary">
                    <Plus size={15} strokeWidth={2.6} />
                    Apply for leave
                  </Link>
                }
              />
            ) : (
              <div className="divide-line">
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
          </div>
        )}
      </PageBody>
    </>
  );
}

async function BalanceStatement({
  userId, user, cfg, ly, balances, compAvailable,
}: {
  userId: string;
  user: { joinDate: Date; confirmDate: Date | null; lastWorkingDay: Date | null; status: string };
  cfg: Awaited<ReturnType<typeof getPolicy>>;
  ly: ReturnType<typeof leaveYearOf>;
  balances: Awaited<ReturnType<typeof getBalances>>;
  compAvailable: number;
}) {
  const entries = await db.leaveLedger.findMany({
    where: { userId, leaveYear: ly.label },
    orderBy: { effectiveDate: "desc" },
    include: { request: { select: { id: true, code: true } } },
  });

  const emp = toEligibility(user);
  const schedule = accrualSchedule("PL", emp, ly, cfg, todayKey());

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.5fr] lg:items-start">
      <div className="space-y-5">
        <section className="card p-5">
          <SectionHeader eyebrow={`Leave year ${ly.label}`} title="Balances" />
          <div className="mt-5 space-y-4">
            {BALANCE_TYPES.map((t) => {
              const b = balances.find((x) => x.leaveType === t)!;
              const available = t === "COMP_OFF" ? compAvailable : b.available;
              return (
                <BalanceBar
                  key={t}
                  available={available}
                  granted={Math.max(b.granted, available, 1)}
                  annualEntitlement={t === "COMP_OFF" ? undefined : b.entitlementAnnual}
                  color={leaveInk(t)}
                  label={LEAVE_META[t].name}
                />
              );
            })}
          </div>
        </section>

        <section className="card p-5">
          <SectionHeader
            eyebrow="§7 Accrual"
            title={cfg.accrualCadence === "ANNUAL" ? "How PL is credited" : "How PL credits this year"}
          />
          <ul className="mt-4 space-y-2">
            {schedule.map((line) => (
              <li
                key={line.period.label}
                className="flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5"
                style={{
                  background: line.credited ? "var(--lt-pl-tint)" : "var(--c-surface-3)",
                  opacity: line.amount > 0 ? 1 : 0.55,
                }}
              >
                <div>
                  <p
                    className="text-[12.5px] font-bold"
                    style={{ color: line.credited ? "var(--lt-pl)" : "var(--c-ink-500)" }}
                  >
                    {line.period.label} · {fmtDate(line.period.start)}
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--c-ink-400)" }}>
                    {line.credited ? "Credited" : "Scheduled"}
                    {line.eligibleDays < line.periodDays &&
                      ` · ${line.eligibleDays} of ${line.periodDays} days eligible`}
                  </p>
                </div>
                <span className="text-[13px] font-extrabold tnum" style={{ color: "var(--c-ink-900)" }}>
                  +{fmtDays(line.amount)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11.5px] leading-relaxed" style={{ color: "var(--c-ink-400)" }}>
            {cfg.accrualCadence === "ANNUAL"
              ? "The whole pro-rata entitlement is credited in one lump the moment you become eligible, rather than spread across the year — a setting an administrator has chosen (§7)."
              : "§7 credits leave quarterly on a pro-rata basis."}{" "}
            Privileged Leave accrues only after confirmation (§6).
          </p>
        </section>
      </div>

      <section className="card overflow-hidden">
        <div className="px-5 pt-5">
          <SectionHeader
            eyebrow="Every movement, with its reason"
            title="Ledger"
          />
        </div>
        {entries.length === 0 ? (
          <EmptyState title="No entries yet" body="Accrual and leave movements will appear here." />
        ) : (
          <div className="mt-4 divide-line">
            {sortLedger(entries as never).map((e) => {
              const entry = e as unknown as (typeof entries)[number];
              const credit = isCredit(entry.entryKind);
              return (
                <div key={entry.id} className="flex items-start gap-3.5 px-5 py-3.5">
                  <span
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                    style={{
                      background: credit ? "var(--c-success-tint)" : "var(--c-ink-100)",
                      color: credit ? "var(--c-success-ink)" : "var(--c-ink-500)",
                    }}
                  >
                    {credit ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <p className="text-[13px] font-bold" style={{ color: "var(--c-ink-900)" }}>
                        {LEDGER_KIND_LABEL[entry.entryKind] ?? entry.entryKind}
                      </p>
                      <span className="text-[11.5px] font-bold" style={{ color: leaveInk(entry.leaveType) }}>
                        {leaveName(entry.leaveType)}
                      </span>
                      {entry.ruleId && (
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                          style={{ background: "var(--c-ink-100)", color: "var(--c-ink-400)" }}
                        >
                          {entry.ruleId}
                        </span>
                      )}
                    </div>
                    {entry.note && (
                      <p className="mt-0.5 text-[12px]" style={{ color: "var(--c-ink-500)" }}>
                        {entry.note}
                      </p>
                    )}
                    <p className="mt-0.5 text-[11px]" style={{ color: "var(--c-ink-400)" }}>
                      {fmtDate(dayKey(entry.effectiveDate))}
                      {entry.request && (
                        <>
                          {" · "}
                          <Link href={`/requests/${entry.request.id}`} style={{ color: "var(--brand-500)" }}>
                            {entry.request.code}
                          </Link>
                        </>
                      )}
                    </p>
                  </div>
                  <span
                    className="shrink-0 text-[13.5px] font-extrabold tnum"
                    style={{ color: credit ? "var(--c-success-ink)" : "var(--c-ink-900)" }}
                  >
                    {entry.amount > 0 ? "+" : ""}
                    {fmtDays(entry.amount)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
