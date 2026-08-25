import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { fmtDays, fmtRange, timeAgo } from "@/lib/date";
import { Avatar, leaveInk, leaveName, StatusChip } from "./ui/primitives";

export type RequestRowData = {
  id: string;
  code: string;
  leaveType: string;
  status: string;
  startDate: string;
  endDate: string;
  chargedDays: number;
  reason: string;
  appliedAt: string;
  halfDay?: string;
  isLop?: boolean;
  user?: { name: string; avatarHue: number; designation?: string };
};

/**
 * The workhorse row. A 3px leave-type bar on the leading edge does the colour-coding so the row
 * itself can stay quiet — type, dates, duration, status, in that reading order.
 */
export function RequestRow({
  request: r,
  showPerson = false,
  href,
}: {
  request: RequestRowData;
  showPerson?: boolean;
  href?: string;
}) {
  const half = r.halfDay && r.halfDay !== "NONE";
  return (
    <Link
      href={href ?? `/requests/${r.id}`}
      className="row-hover group relative flex items-center gap-3.5 py-3.5 pl-5 pr-4 sm:gap-4"
    >
      <span
        className="absolute left-0 top-1/2 h-[calc(100%-16px)] w-[3px] -translate-y-1/2 rounded-r-full"
        style={{ background: leaveInk(r.leaveType) }}
      />

      {showPerson && r.user && (
        <Avatar name={r.user.name} hue={r.user.avatarHue} size={38} />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="text-[13.5px] font-bold" style={{ color: "var(--c-ink-900)" }}>
            {showPerson && r.user ? r.user.name : leaveName(r.leaveType)}
          </p>
          {showPerson && (
            <span className="text-[12px]" style={{ color: leaveInk(r.leaveType) }}>
              {leaveName(r.leaveType)}
            </span>
          )}
          <span className="text-[12px]" style={{ color: "var(--c-ink-400)" }}>
            {r.code}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[12.5px]" style={{ color: "var(--c-ink-500)" }}>
          {fmtRange(r.startDate, r.endDate)}
          {half && " · half day"}
          {r.reason ? ` — ${r.reason}` : ""}
        </p>
      </div>

      <div className="hidden shrink-0 text-right sm:block">
        <p className="text-[13.5px] font-extrabold tnum" style={{ color: "var(--c-ink-900)" }}>
          {fmtDays(r.chargedDays)}
        </p>
        <p className="text-[11px]" style={{ color: "var(--c-ink-400)" }}>
          {r.chargedDays === 1 ? "day" : "days"}
        </p>
      </div>

      <div className="shrink-0">
        <StatusChip status={r.status} size="sm" />
      </div>

      <span
        className="hidden shrink-0 text-[11px] tabular-nums md:block"
        style={{ color: "var(--c-ink-400)", minWidth: 58, textAlign: "right" }}
      >
        {timeAgo(r.appliedAt)}
      </span>

      <ChevronRight
        size={16}
        className="shrink-0 transition-transform duration-150 group-hover:translate-x-0.5"
        style={{ color: "var(--c-ink-400)" }}
      />
    </Link>
  );
}
