import Link from "next/link";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageBody, PageHeader } from "@/components/PageHeader";
import { CalendarLegend, MonthCalendar } from "@/components/MonthCalendar";
import { Avatar, Chip, SectionHeader, leaveInk } from "@/components/ui/primitives";
import {
  dayKey, fmtDate, fmtDays, monthEndKey, monthName, monthStartKey, todayKey,
} from "@/lib/date";
import { getPolicy } from "@/lib/services/context";
import { isHrOrAdmin } from "@/lib/policy/types";

export const metadata = { title: "Calendar" };

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string; dept?: string }>;
}) {
  const params = await searchParams;
  const user = await requireUser();
  const today = todayKey();
  const cfg = await getPolicy();

  const now = new Date();
  const year = Number(params.y) || Number(today.slice(0, 4));
  const month = params.m !== undefined ? Number(params.m) : Number(today.slice(5, 7)) - 1;

  const monthStart = monthStartKey(year, month);
  const monthEnd = monthEndKey(year, month);

  const departments = await db.department.findMany({ orderBy: { name: "asc" } });
  const scopeAll = isHrOrAdmin(user.role) || user.role === "HOD";
  const deptFilter =
    params.dept === "all"
      ? undefined
      : params.dept || (scopeAll ? undefined : user.departmentId ?? undefined);

  const [days, holidays] = await Promise.all([
    db.leaveRequestDay.findMany({
      where: {
        charged: { gt: 0 },
        date: {
          gte: new Date(`${monthStart}T00:00:00.000Z`),
          lte: new Date(`${monthEnd}T00:00:00.000Z`),
        },
        request: {
          status: { in: ["APPROVED", "PENDING", "PENDING_HOD"] },
          ...(deptFilter ? { user: { departmentId: deptFilter } } : {}),
        },
      },
      include: {
        request: {
          select: {
            id: true, leaveType: true, status: true,
            user: { select: { id: true, name: true, avatarHue: true, designation: true } },
          },
        },
      },
      orderBy: { date: "asc" },
    }),
    db.holiday.findMany({
      where: {
        date: {
          gte: new Date(`${monthStart}T00:00:00.000Z`),
          lte: new Date(`${monthEnd}T00:00:00.000Z`),
        },
      },
      orderBy: { date: "asc" },
    }),
  ]);

  const entries = days.map((d) => ({
    date: dayKey(d.date),
    person: d.request.user,
    leaveType: d.request.leaveType,
    requestId: d.request.id,
    charged: d.charged,
    status: d.request.status,
  }));

  const prev = month === 0 ? { y: year - 1, m: 11 } : { y: year, m: month - 1 };
  const next = month === 11 ? { y: year + 1, m: 0 } : { y: year, m: month + 1 };
  const qs = (o: { y: number; m: number }) =>
    `/calendar?y=${o.y}&m=${o.m}${params.dept ? `&dept=${params.dept}` : ""}`;

  // Who is out this month, aggregated per person
  const byPerson = new Map<string, { name: string; avatarHue: number; designation: string; days: number; type: string }>();
  for (const e of entries) {
    const k = e.person.id;
    if (!byPerson.has(k)) {
      byPerson.set(k, {
        name: e.person.name, avatarHue: e.person.avatarHue,
        designation: e.person.designation, days: 0, type: e.leaveType,
      });
    }
    byPerson.get(k)!.days += e.charged;
  }
  const outThisMonth = [...byPerson.values()].sort((a, b) => b.days - a.days);
  const typesPresent = [...new Set(entries.map((e) => e.leaveType))];

  const activeDeptName =
    params.dept === "all"
      ? "Everyone"
      : departments.find((d) => d.id === deptFilter)?.name ?? "Everyone";

  return (
    <>
      <PageHeader
        title="Leave calendar"
        subtitle={`${monthName(month)} ${year} · ${activeDeptName}`}
      />

      <PageBody className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link href={qs(prev)} className="btn btn-ghost" style={{ padding: "8px 12px" }} aria-label="Previous month">
              <ChevronLeft size={16} />
            </Link>
            <p className="min-w-[150px] text-center text-[15px] font-bold" style={{ color: "var(--c-ink-900)" }}>
              {monthName(month)} {year}
            </p>
            <Link href={qs(next)} className="btn btn-ghost" style={{ padding: "8px 12px" }} aria-label="Next month">
              <ChevronRight size={16} />
            </Link>
            <Link
              href={`/calendar${params.dept ? `?dept=${params.dept}` : ""}`}
              className="btn btn-quiet"
              style={{ padding: "8px 14px" }}
            >
              Today
            </Link>
          </div>

          {(scopeAll || departments.length > 1) && (
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/calendar?y=${year}&m=${month}&dept=all`}
                className="chip"
                style={{
                  background: params.dept === "all" ? "var(--lt-pl)" : "var(--c-surface)",
                  color: params.dept === "all" ? "#fff" : "var(--c-ink-500)",
                  border: `1px solid ${params.dept === "all" ? "var(--lt-pl)" : "var(--c-border)"}`,
                  padding: "6px 12px",
                }}
              >
                Everyone
              </Link>
              {departments.map((d) => {
                const active = deptFilter === d.id && params.dept !== "all";
                return (
                  <Link
                    key={d.id}
                    href={`/calendar?y=${year}&m=${month}&dept=${d.id}`}
                    className="chip"
                    style={{
                      background: active ? "var(--lt-pl)" : "var(--c-surface)",
                      color: active ? "#fff" : "var(--c-ink-500)",
                      border: `1px solid ${active ? "var(--lt-pl)" : "var(--c-border)"}`,
                      padding: "6px 12px",
                    }}
                  >
                    {d.name}
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid gap-5 xl:grid-cols-[1fr_300px] xl:items-start">
          <section className="card p-4 sm:p-5">
            <MonthCalendar
              year={year}
              month={month}
              entries={entries}
              holidays={holidays.map((h) => ({ date: dayKey(h.date), name: h.name, type: h.type }))}
              weeklyOffs={cfg.weeklyOffs}
              today={today}
              selfId={user.id}
            />
            <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--c-border)" }}>
              <CalendarLegend types={typesPresent.length ? typesPresent : ["CL", "SL", "PL"]} />
              <p className="mt-2.5 text-[11px]" style={{ color: "var(--c-ink-400)" }}>
                Click any day to start a leave request for it. A coloured border marks your own leave.
              </p>
            </div>
          </section>

          <aside className="space-y-5">
            <section className="card p-5">
              <SectionHeader
                eyebrow={`${monthName(month, true)} ${year}`}
                title={outThisMonth.length === 0 ? "Nobody's out" : `${outThisMonth.length} away this month`}
              />
              {outThisMonth.length === 0 ? (
                <p className="mt-3 text-[13px]" style={{ color: "var(--c-ink-500)" }}>
                  No approved or pending leave in this month for {activeDeptName.toLowerCase()}.
                </p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {outThisMonth.slice(0, 10).map((p, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <Avatar name={p.name} hue={p.avatarHue} size={32} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-bold" style={{ color: "var(--c-ink-900)" }}>
                          {p.name}
                        </p>
                        <p className="truncate text-[11px]" style={{ color: "var(--c-ink-400)" }}>
                          {p.designation}
                        </p>
                      </div>
                      <span
                        className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-extrabold tnum"
                        style={{ background: "var(--c-ink-100)", color: "var(--c-ink-700)" }}
                      >
                        {fmtDays(p.days)}d
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {holidays.length > 0 && (
              <section className="card p-5">
                <SectionHeader eyebrow="This month" title="Holidays" />
                <ul className="mt-4 space-y-2.5">
                  {holidays.map((h) => (
                    <li key={h.id} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] font-bold" style={{ color: "var(--c-ink-900)" }}>
                          {h.name}
                        </p>
                        <p className="text-[11px]" style={{ color: "var(--c-ink-400)" }}>
                          {fmtDate(dayKey(h.date))}
                        </p>
                      </div>
                      <Chip tone={h.type === "NATIONAL" ? "brand" : "neutral"} size="sm">
                        {h.type === "NATIONAL" ? "National" : "Declared"}
                      </Chip>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>
      </PageBody>
    </>
  );
}
