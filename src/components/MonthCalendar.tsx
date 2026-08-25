import Link from "next/link";
import { AvatarStack, leaveInk, leaveTint } from "./ui/primitives";
import {
  DayKey, addDaysKey, daysInMonth, dayKey, fmtDate, monthStartKey, weekdayName, weekdayOf,
} from "@/lib/date";

export type CalendarPerson = { id: string; name: string; avatarHue: number };
export type CalendarEntry = {
  date: DayKey;
  person: CalendarPerson;
  leaveType: string;
  requestId: string;
  charged: number;
  status: string;
};

export type CalendarHoliday = { date: DayKey; name: string; type: string };

/**
 * Month grid. A day is a rounded cell; leave appears as stacked avatars in the type colour,
 * holidays carry a diagonal hatch, weekly offs sit on a recessed fill.
 */
export function MonthCalendar({
  year,
  month,
  entries,
  holidays,
  weeklyOffs,
  today,
  selfId,
  linkDays = true,
}: {
  year: number;
  month: number; // 0-indexed
  entries: CalendarEntry[];
  holidays: CalendarHoliday[];
  weeklyOffs: number[];
  today: DayKey;
  selfId?: string;
  linkDays?: boolean;
}) {
  const first = monthStartKey(year, month);
  const total = daysInMonth(year, month);
  const leadBlank = weekdayOf(first);

  const byDate = new Map<DayKey, CalendarEntry[]>();
  for (const e of entries) {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date)!.push(e);
  }
  const holidayByDate = new Map(holidays.map((h) => [h.date, h]));

  const cells: (DayKey | null)[] = [
    ...Array.from({ length: leadBlank }, () => null),
    ...Array.from({ length: total }, (_, i) => addDaysKey(first, i)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="pb-1 text-center">
            <span className="eyebrow" style={{ fontSize: 10 }}>
              {weekdayName(i, true)}
            </span>
          </div>
        ))}

        {cells.map((key, i) => {
          if (!key) return <div key={`b${i}`} />;

          const holiday = holidayByDate.get(key);
          const isOff = weeklyOffs.includes(weekdayOf(key));
          const isToday = key === today;
          const dayEntries = byDate.get(key) ?? [];
          const dominantType = dayEntries[0]?.leaveType;
          const mine = selfId ? dayEntries.some((e) => e.person.id === selfId) : false;

          const inner = (
            <>
              <div className="flex items-start justify-between gap-1">
                <span
                  className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1 text-[11.5px] font-extrabold tnum"
                  style={
                    isToday
                      ? { background: "var(--brand-500)", color: "#fff" }
                      : { color: holiday || isOff ? "var(--c-ink-400)" : "var(--c-ink-900)" }
                  }
                >
                  {Number(key.slice(8, 10))}
                </span>
                {dayEntries.length > 0 && (
                  <span
                    className="mt-0.5 rounded-md px-1.5 text-[9.5px] font-extrabold"
                    style={{
                      background: leaveTint(dominantType),
                      color: leaveInk(dominantType),
                    }}
                  >
                    {dayEntries.length}
                  </span>
                )}
              </div>

              {holiday && (
                <p
                  className="mt-1 line-clamp-2 text-[9.5px] font-bold leading-tight"
                  style={{ color: "var(--lt-mat)" }}
                  title={holiday.name}
                >
                  {holiday.name}
                </p>
              )}

              {dayEntries.length > 0 && (
                <div className="mt-auto pt-1.5">
                  <AvatarStack
                    people={dayEntries.map((e) => ({ name: e.person.name, avatarHue: e.person.avatarHue }))}
                    size={20}
                    max={3}
                  />
                </div>
              )}
            </>
          );

          const style: React.CSSProperties = {
            background: isOff && !holiday ? "var(--c-ink-50)" : "var(--c-surface)",
            borderColor: mine
              ? leaveInk(dominantType ?? "PL")
              : isToday
                ? "var(--brand-300)"
                : "var(--c-border)",
            borderWidth: mine || isToday ? 1.5 : 1,
          };

          return (
            <div
              key={key}
              className={`relative flex min-h-[86px] flex-col rounded-xl border p-1.5 transition-colors sm:min-h-[104px] sm:p-2 ${holiday ? "hatch" : ""}`}
              style={style}
            >
              {linkDays ? (
                <Link
                  href={`/apply?date=${key}`}
                  className="absolute inset-0 rounded-xl"
                  aria-label={`Apply for leave on ${fmtDate(key)}`}
                />
              ) : null}
              <div className="pointer-events-none relative flex h-full flex-col">{inner}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CalendarLegend({ types }: { types: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {types.map((t) => (
        <span key={t} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: leaveInk(t) }} />
          <span className="text-[11.5px] font-semibold" style={{ color: "var(--c-ink-500)" }}>
            {t === "COMP_OFF" ? "Comp-off" : t}
          </span>
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span
          className="hatch h-2.5 w-2.5 rounded-[3px] border"
          style={{ borderColor: "var(--c-border)" }}
        />
        <span className="text-[11.5px] font-semibold" style={{ color: "var(--c-ink-500)" }}>
          Holiday
        </span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: "var(--c-ink-100)" }} />
        <span className="text-[11.5px] font-semibold" style={{ color: "var(--c-ink-500)" }}>
          Weekly off
        </span>
      </span>
    </div>
  );
}
