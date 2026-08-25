import Link from "next/link";
import { ChevronRight, Plus, Search, TriangleAlert, Upload, Users } from "lucide-react";
import { requireHr } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageBody, PageHeader } from "@/components/PageHeader";
import { Avatar, Chip, EmptyState, SectionHeader, leaveInk } from "@/components/ui/primitives";
import { dayKey, fmtDate, fmtDays, todayKey } from "@/lib/date";
import { getBalances, getPolicy } from "@/lib/services/context";
import { leaveYearOf } from "@/lib/policy/leave-year";
import { EMPLOYMENT_STATUS_LABEL, EMPLOYMENT_TYPE_LABEL, ROLE_LABEL } from "@/lib/policy/types";
import type { Role } from "@/lib/policy/types";

export const metadata = { title: "Employees" };

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; dept?: string; status?: string }>;
}) {
  const params = await searchParams;
  await requireHr();

  const today = todayKey();
  const cfg = await getPolicy();
  const ly = leaveYearOf(today, cfg);
  const q = (params.q ?? "").trim();

  const [departments, employees, openFlags] = await Promise.all([
    db.department.findMany({ orderBy: { name: "asc" } }),
    db.user.findMany({
      where: {
        ...(params.dept ? { departmentId: params.dept } : {}),
        ...(params.status ? { status: params.status } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q } },
                { email: { contains: q } },
                { empCode: { contains: q } },
                { designation: { contains: q } },
              ],
            }
          : {}),
      },
      include: {
        department: { select: { name: true } },
        manager: { select: { name: true } },
      },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    }),
    db.absenceFlag.findMany({
      where: { status: "OPEN" },
      include: { user: { select: { id: true, name: true, avatarHue: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const balances = new Map(
    await Promise.all(
      employees.map(async (e) => [e.id, await getBalances(e.id, cfg, ly, today)] as const),
    ),
  );

  const statusCounts = {
    PROBATION: employees.filter((e) => e.status === "PROBATION").length,
    CONFIRMED: employees.filter((e) => e.status === "CONFIRMED").length,
    RESIGNED: employees.filter((e) => e.status === "RESIGNED").length,
  };

  return (
    <>
      <PageHeader
        title="Employees"
        subtitle={`${employees.length} on record · leave year ${ly.label}`}
        actions={
          <>
            <Link href="/employees/import" className="btn btn-ghost hidden sm:inline-flex">
              <Upload size={15} />
              Import
            </Link>
            <Link href="/employees/new" className="btn btn-primary hidden sm:inline-flex">
              <Plus size={15} strokeWidth={2.6} />
              Add employee
            </Link>
          </>
        }
      />

      <PageBody className="space-y-5">
        {openFlags.length > 0 && (
          <section
            className="card p-5"
            style={{ background: "var(--c-danger-tint)", borderColor: "transparent" }}
          >
            <div className="flex items-start gap-3">
              <TriangleAlert size={18} style={{ color: "var(--c-danger-ink)", marginTop: 2 }} />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold" style={{ color: "var(--c-danger-ink)" }}>
                  {openFlags.length === 1
                    ? "1 unaccounted absence needs review"
                    : `${openFlags.length} unaccounted absences need review`}
                </p>
                <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--c-danger-ink)" }}>
                  §12 treats {cfg.abscondingDays} or more consecutive working days of unauthorised
                  absence as absconding. LeaveBase raises the flag — the decision stays with you.
                </p>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {openFlags.slice(0, 6).map((f) => (
                    <li key={f.id}>
                      <Link
                        href={`/employees/${f.user.id}`}
                        className="chip"
                        style={{ background: "var(--c-surface)", color: "var(--c-danger-ink)" }}
                      >
                        <Avatar name={f.user.name} hue={f.user.avatarHue} size={16} />
                        {f.user.name} · {f.workingDays}d
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        )}

        <form className="card flex flex-wrap items-center gap-3 p-4" action="/employees">
          <div className="relative min-w-[220px] flex-1">
            <Search
              size={15}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2"
              style={{ color: "var(--c-ink-400)" }}
            />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search by name, code, email or designation"
              className="field pl-10"
            />
          </div>
          <select name="dept" defaultValue={params.dept ?? ""} className="field" style={{ width: "auto" }}>
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <select name="status" defaultValue={params.status ?? ""} className="field" style={{ width: "auto" }}>
            <option value="">Any status</option>
            <option value="PROBATION">On probation ({statusCounts.PROBATION})</option>
            <option value="CONFIRMED">Confirmed ({statusCounts.CONFIRMED})</option>
            <option value="RESIGNED">Serving notice ({statusCounts.RESIGNED})</option>
          </select>
          <button type="submit" className="btn btn-primary">Filter</button>
          {(q || params.dept || params.status) && (
            <Link href="/employees" className="btn btn-quiet">Clear</Link>
          )}
        </form>

        <section className="card overflow-hidden">
          {employees.length === 0 ? (
            <EmptyState icon={<Users size={20} />} title="No one matches that" body="Try a different search or clear the filters." />
          ) : (
            <>
              <div
                className="hidden items-center gap-4 border-b px-5 py-2.5 lg:flex"
                style={{ borderColor: "var(--c-border)" }}
              >
                <span className="eyebrow flex-1">Employee</span>
                <span className="eyebrow w-[130px]">Department</span>
                <span className="eyebrow w-[120px]">Status</span>
                <span className="eyebrow w-[170px] text-right">CL · SL · PL available</span>
                <span className="w-4" />
              </div>
              <div className="divide-line">
                {employees.map((e) => {
                  const b = balances.get(e.id) ?? [];
                  const get = (t: string) => b.find((x) => x.leaveType === t)?.available ?? 0;
                  return (
                    <Link
                      key={e.id}
                      href={`/employees/${e.id}`}
                      className="row-hover group flex flex-wrap items-center gap-4 px-5 py-3.5"
                      style={{ opacity: e.isActive ? 1 : 0.55 }}
                    >
                      <div className="flex min-w-[200px] flex-1 items-center gap-3.5">
                        <Avatar name={e.name} hue={e.avatarHue} size={40} />
                        <div className="min-w-0">
                          <p className="truncate text-[13.5px] font-bold" style={{ color: "var(--c-ink-900)" }}>
                            {e.name}
                          </p>
                          <p className="truncate text-[12px]" style={{ color: "var(--c-ink-500)" }}>
                            {e.designation}
                          </p>
                          <p className="mt-0.5 text-[11px]" style={{ color: "var(--c-ink-400)" }}>
                            {e.empCode}
                            {e.manager ? ` · reports to ${e.manager.name}` : " · no reporting manager"}
                          </p>
                        </div>
                      </div>

                      <div className="w-[130px]">
                        <p className="text-[12.5px] font-semibold" style={{ color: "var(--c-ink-700)" }}>
                          {e.department?.name ?? "—"}
                        </p>
                        <p className="text-[11px]" style={{ color: "var(--c-ink-400)" }}>
                          {ROLE_LABEL[e.role as Role]}
                        </p>
                      </div>

                      <div className="w-[120px]">
                        <Chip
                          tone={
                            e.status === "CONFIRMED" ? "success"
                            : e.status === "PROBATION" ? "warning"
                            : e.status === "RESIGNED" ? "danger" : "neutral"
                          }
                          size="sm"
                        >
                          {EMPLOYMENT_STATUS_LABEL[e.status]}
                        </Chip>
                        <p className="mt-1 text-[10.5px]" style={{ color: "var(--c-ink-400)" }}>
                          {EMPLOYMENT_TYPE_LABEL[e.employmentType]}
                        </p>
                      </div>

                      <div className="flex w-[170px] items-center justify-end gap-2">
                        {["CL", "SL", "PL"].map((t) => (
                          <span
                            key={t}
                            className="flex h-9 w-[46px] flex-col items-center justify-center rounded-lg"
                            style={{ background: "var(--c-surface-3)" }}
                            title={t}
                          >
                            <span
                              className="text-[12.5px] font-extrabold tnum leading-none"
                              style={{ color: leaveInk(t) }}
                            >
                              {fmtDays(get(t))}
                            </span>
                            <span className="mt-0.5 text-[9px] font-bold" style={{ color: "var(--c-ink-400)" }}>
                              {t}
                            </span>
                          </span>
                        ))}
                      </div>

                      <ChevronRight
                        size={16}
                        className="transition-transform group-hover:translate-x-0.5"
                        style={{ color: "var(--c-ink-400)" }}
                      />
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </PageBody>
    </>
  );
}
