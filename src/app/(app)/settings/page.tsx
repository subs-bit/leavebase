import Link from "next/link";
import { Download, ScrollText } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageBody, PageHeader } from "@/components/PageHeader";
import { Avatar, Chip, EmptyState, SectionHeader } from "@/components/ui/primitives";
import { HolidayForm, MaintenanceJobs, PolicyForm, RemoveHoliday } from "./SettingsForms";
import { DeleteDepartment, DepartmentForm, HodPicker } from "./DepartmentForms";
import { dayKey, fmtDate, fmtDateTime, timeAgo, todayKey } from "@/lib/date";
import { getPolicy } from "@/lib/services/context";
import { leaveYearOf } from "@/lib/policy/leave-year";

export const metadata = { title: "Settings" };

const TABS = [
  { key: "policy", label: "Policy values" },
  { key: "departments", label: "Departments" },
  { key: "holidays", label: "Holidays" },
  { key: "jobs", label: "Maintenance" },
  { key: "audit", label: "Audit log" },
];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab = "policy" } = await searchParams;
  await requireAdmin();

  const cfg = await getPolicy();
  const today = todayKey();
  const ly = leaveYearOf(today, cfg);

  const [holidays, logs, departments, hodCandidates] = await Promise.all([
    tab === "holidays"
      ? db.holiday.findMany({ orderBy: { date: "asc" } })
      : Promise.resolve([]),
    tab === "audit"
      ? db.auditLog.findMany({
          orderBy: { createdAt: "desc" },
          take: 80,
          include: { actor: { select: { avatarHue: true } } },
        })
      : Promise.resolve([]),
    tab === "departments"
      ? db.department.findMany({
          orderBy: { name: "asc" },
          include: {
            hod: { select: { id: true, name: true, designation: true, avatarHue: true } },
            _count: { select: { members: true } },
          },
        })
      : Promise.resolve([]),
    tab === "departments"
      ? db.user.findMany({
          where: { isActive: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true, designation: true, avatarHue: true },
        })
      : Promise.resolve([]),
  ]);

  const upcomingHolidays = holidays.filter((h) => dayKey(h.date) >= today);
  const pastHolidays = holidays.filter((h) => dayKey(h.date) < today);

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle={`Leave year ${ly.label} · policy effective ${fmtDate(cfg.effectiveFrom)}`}
      />

      <PageBody className="space-y-5">
        <nav className="flex flex-wrap gap-2">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <Link
                key={t.key}
                href={`/settings?tab=${t.key}`}
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
              </Link>
            );
          })}
        </nav>

        {tab === "policy" && (
          <>
            <section
              className="card p-5"
              style={{ background: "var(--c-info-tint)", borderColor: "transparent" }}
            >
              <div className="flex items-start gap-3">
                <ScrollText size={17} style={{ color: "var(--c-info-ink)", marginTop: 2 }} />
                <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--c-ink-700)" }}>
                  These values are what the rule engine enforces. Changing one takes effect on the
                  next evaluation — it does not retroactively alter leave already approved, and every
                  change is written to the audit log with the old and new value.
                </p>
              </div>
            </section>

            <section className="card p-5 sm:p-6">
              <SectionHeader
                eyebrow="Rule engine"
                title="Policy values"
              />
              <div className="mt-5">
                <PolicyForm cfg={cfg} />
              </div>
            </section>
          </>
        )}

        {tab === "departments" && (
          <>
            <section className="card p-5 sm:p-6">
              <SectionHeader eyebrow="Structure" title="Add a department" />
              <div className="mt-4">
                <DepartmentForm />
              </div>
              <p className="mt-3 text-[11.5px] leading-relaxed" style={{ color: "var(--c-ink-400)" }}>
                The head of department is the second approver for runs of Privileged Leave longer
                than the short-run boundary (§6), and approves their own team&rsquo;s exceptions.
              </p>
            </section>

            <section className="card overflow-hidden">
              <div className="px-5 pt-5">
                <SectionHeader
                  eyebrow={`${departments.length} departments`}
                  title="Heads of department"
                />
              </div>
              {departments.length === 0 ? (
                <EmptyState
                  title="No departments yet"
                  body="Add them above, or let the employee import create them from your spreadsheet."
                />
              ) : (
                <div className="mt-4 divide-line">
                  {departments.map((d) => (
                    <div key={d.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                      <div className="min-w-[180px] flex-1">
                        <p className="text-[13.5px] font-bold" style={{ color: "var(--c-ink-900)" }}>
                          {d.name}
                        </p>
                        <p className="text-[11.5px]" style={{ color: "var(--c-ink-400)" }}>
                          {d.code} · {d._count.members}{" "}
                          {d._count.members === 1 ? "person" : "people"}
                        </p>
                      </div>

                      {d.hod && (
                        <div className="flex items-center gap-2">
                          <Avatar name={d.hod.name} hue={d.hod.avatarHue} size={28} />
                          <span className="text-[12px] font-semibold" style={{ color: "var(--c-ink-700)" }}>
                            {d.hod.name}
                          </span>
                        </div>
                      )}

                      <HodPicker
                        departmentId={d.id}
                        currentHodId={d.hodId}
                        candidates={hodCandidates}
                      />

                      {d._count.members === 0 && (
                        <DeleteDepartment departmentId={d.id} name={d.name} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {tab === "holidays" && (
          <>
            <section className="card p-5 sm:p-6">
              <SectionHeader
                eyebrow="Company calendar"
                title="Add a holiday"
              />
              <div className="mt-4">
                <HolidayForm />
              </div>
              <p className="mt-3 text-[11.5px] leading-relaxed" style={{ color: "var(--c-ink-400)" }}>
                Declared holidays feed the §8 intervening-days rule and make a day eligible for a
                §11 comp-off claim.
              </p>
            </section>

            <section className="card overflow-hidden">
              <div className="px-5 pt-5">
                <SectionHeader
                  eyebrow={`${upcomingHolidays.length} upcoming`}
                  title="Holiday calendar"
                />
              </div>
              {holidays.length === 0 ? (
                <EmptyState title="No holidays configured" body="Add the company holiday list for the year." />
              ) : (
                <div className="mt-4 divide-line">
                  {[...upcomingHolidays, ...pastHolidays].map((h) => {
                    const k = dayKey(h.date);
                    const past = k < today;
                    return (
                      <div
                        key={h.id}
                        className="flex items-center gap-4 px-5 py-3"
                        style={{ opacity: past ? 0.5 : 1 }}
                      >
                        <div
                          className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl"
                          style={{ background: "var(--lt-mat-tint)", color: "var(--lt-mat)" }}
                        >
                          <span className="text-[14px] font-extrabold leading-none tnum">
                            {Number(k.slice(8, 10))}
                          </span>
                          <span className="mt-0.5 text-[9px] font-bold uppercase">
                            {fmtDate(k).split(" ")[1]}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13.5px] font-bold" style={{ color: "var(--c-ink-900)" }}>
                            {h.name}
                          </p>
                          <p className="text-[11.5px]" style={{ color: "var(--c-ink-400)" }}>
                            {fmtDate(k)}
                          </p>
                        </div>
                        <Chip tone={h.type === "NATIONAL" ? "brand" : "neutral"} size="sm">
                          {h.type === "NATIONAL" ? "National" : h.type === "RESTRICTED" ? "Restricted" : "Declared"}
                        </Chip>
                        <RemoveHoliday holidayId={h.id} />
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}

        {tab === "jobs" && (
          <section className="card p-5 sm:p-6">
            <SectionHeader
              eyebrow="Scheduled work"
              title="Maintenance"
            />
            <div className="mt-5">
              <MaintenanceJobs />
            </div>
          </section>
        )}

        {tab === "audit" && (
          <section className="card overflow-hidden">
            <div className="px-5 pt-5">
              <SectionHeader
                eyebrow="Immutable record"
                title="Audit log"
                action={
                  <a
                    href="/api/export/audit.csv"
                    className="btn btn-ghost"
                    style={{ padding: "7px 14px" }}
                  >
                    <Download size={14} />
                    Export
                  </a>
                }
              />
            </div>
            {logs.length === 0 ? (
              <EmptyState title="Nothing recorded yet" />
            ) : (
              <div className="mt-4 divide-line">
                {logs.map((l) => (
                  <div key={l.id} className="flex items-start gap-3.5 px-5 py-3">
                    <Avatar name={l.actorName} hue={l.actor?.avatarHue ?? 250} size={30} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] leading-snug" style={{ color: "var(--c-ink-700)" }}>
                        <span className="font-bold" style={{ color: "var(--c-ink-900)" }}>
                          {l.actorName}
                        </span>{" "}
                        {l.summary}
                      </p>
                      <p className="mt-0.5 text-[11px]" style={{ color: "var(--c-ink-400)" }}>
                        {fmtDateTime(l.createdAt)} · {l.action}
                      </p>
                    </div>
                    <span
                      className="shrink-0 text-[11px]"
                      style={{ color: "var(--c-ink-400)" }}
                    >
                      {timeAgo(l.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </PageBody>
    </>
  );
}
