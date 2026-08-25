import Link from "next/link";
import { Clock3, Gift } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageBody, PageHeader } from "@/components/PageHeader";
import { Chip, EmptyState, SectionHeader, StatusChip } from "@/components/ui/primitives";
import { ClaimForm } from "./ClaimForm";
import { addDaysKey, dayKey, diffDays, eachDayKey, fmtDate, todayKey } from "@/lib/date";
import { getCompOffAvailable, getPolicy } from "@/lib/services/context";
import { getCalendarContext } from "@/lib/services/context";
import { classifyDay } from "@/lib/policy/calendar";
import { leaveYearOf } from "@/lib/policy/leave-year";

export const metadata = { title: "Comp-off" };

export default async function CompOffPage() {
  const user = await requireUser();
  const today = todayKey();
  const cfg = await getPolicy();
  const ly = leaveYearOf(today, cfg);

  const [claims, available, ctx] = await Promise.all([
    db.compOffCredit.findMany({
      where: { userId: user.id },
      orderBy: { workedDate: "desc" },
      include: { consumedBy: { select: { id: true, code: true, startDate: true } } },
    }),
    getCompOffAvailable(user.id, today),
    getCalendarContext(user.id, cfg),
  ]);

  // Days in the last 60 that were a holiday or weekly off and haven't been claimed yet.
  const claimed = new Set(claims.map((c) => dayKey(c.workedDate)));
  const eligibleDays = eachDayKey(addDaysKey(today, -60), addDaysKey(today, -1))
    .filter((d) => classifyDay(d, ctx).type !== "WORKING" && !claimed.has(d))
    .reverse();

  const usedThisYear = claims.filter((c) => c.status === "CONSUMED" && c.leaveYear === ly.label).length;
  const live = claims.filter((c) => c.status === "APPROVED");
  const expiringSoon = live.filter((c) => diffDays(today, dayKey(c.expiresAt)) <= 7);

  return (
    <>
      <PageHeader
        title="Compensatory off"
        subtitle="Earned by working a declared holiday or a weekly off with prior approval (§11)."
        actions={
          available > 0 ? (
            <Link href="/apply?type=COMP_OFF" className="btn btn-ghost hidden sm:inline-flex">
              Use a comp-off
            </Link>
          ) : undefined
        }
      />

      <PageBody className="space-y-5">
        <section className="grid gap-4 sm:grid-cols-3">
          <Tile
            label="Available now"
            value={String(available)}
            sub={available === 1 ? "credit in hand" : "credits in hand"}
            tone="var(--lt-co)"
            tint="var(--lt-co-tint)"
          />
          <Tile
            label="Availed this year"
            value={`${usedThisYear}`}
            sub={`of ${cfg.compOffMaxPerYear} allowed (§11)`}
            tone="var(--lt-pl)"
            tint="var(--lt-pl-tint)"
          />
          <Tile
            label="Expiring within a week"
            value={String(expiringSoon.length)}
            sub={expiringSoon.length > 0 ? `soonest ${fmtDate(dayKey(expiringSoon[0].expiresAt))}` : "nothing at risk"}
            tone={expiringSoon.length > 0 ? "var(--c-danger)" : "var(--c-ink-400)"}
            tint={expiringSoon.length > 0 ? "var(--c-danger-tint)" : "var(--c-ink-100)"}
          />
        </section>

        <section className="card p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <SectionHeader
              eyebrow="§11 Compensatory leave"
              title="How this works"
            />
          </div>
          <ol className="mt-4 grid gap-3 sm:grid-cols-4">
            {[
              ["Get approval first", "Working a holiday or weekly off needs your reporting manager's prior approval."],
              ["Raise a claim", "Log the day you worked. Your manager reviews it."],
              ["Credit appears", "Approval puts one comp-off in your balance."],
              [`Use it within ${cfg.compOffExpiryDays} days`, "Apply for comp-off leave on a working day, or the credit lapses."],
            ].map(([title, body], i) => (
              <li key={i} className="rounded-2xl p-4" style={{ background: "var(--c-surface-2)" }}>
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-lg text-[11px] font-extrabold"
                  style={{ background: "var(--lt-co-tint)", color: "var(--lt-co)" }}
                >
                  {i + 1}
                </span>
                <p className="mt-2.5 text-[13px] font-bold" style={{ color: "var(--c-ink-900)" }}>
                  {title}
                </p>
                <p className="mt-1 text-[11.5px] leading-snug" style={{ color: "var(--c-ink-500)" }}>
                  {body}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <div>
          <ClaimForm expiryDays={cfg.compOffExpiryDays} eligibleDays={eligibleDays} />
        </div>

        <section className="card overflow-hidden">
          <div className="px-5 pt-5">
            <SectionHeader eyebrow="Your history" title="Claims" />
          </div>
          {claims.length === 0 ? (
            <EmptyState
              icon={<Gift size={20} />}
              title="No comp-off claims yet"
              body="If you've worked a holiday or a weekly off with your manager's approval, claim it here."
            />
          ) : (
            <div className="mt-4 divide-line">
              {claims.map((c) => {
                const exp = dayKey(c.expiresAt);
                const left = diffDays(today, exp);
                const isLive = c.status === "APPROVED";
                return (
                  <div key={c.id} className="flex flex-wrap items-center gap-3.5 px-5 py-3.5">
                    <span
                      className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl"
                      style={{ background: "var(--lt-co-tint)", color: "var(--lt-co)" }}
                    >
                      <Gift size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-bold" style={{ color: "var(--c-ink-900)" }}>
                        Worked {fmtDate(dayKey(c.workedDate))}
                        <span className="ml-2 text-[11.5px] font-semibold" style={{ color: "var(--c-ink-400)" }}>
                          {c.workedDayType === "HOLIDAY" ? "declared holiday" : "weekly off"}
                        </span>
                      </p>
                      <p className="truncate text-[12px]" style={{ color: "var(--c-ink-500)" }}>
                        {c.reason}
                      </p>
                      {c.status === "CONSUMED" && c.consumedBy && (
                        <p className="mt-0.5 text-[11px]" style={{ color: "var(--c-ink-400)" }}>
                          Used on{" "}
                          <Link href={`/requests/${c.consumedBy.id}`} style={{ color: "var(--brand-500)" }}>
                            {c.consumedBy.code}
                          </Link>
                        </p>
                      )}
                      {c.status === "REJECTED" && c.rejectComment && (
                        <p className="mt-0.5 text-[11px]" style={{ color: "var(--c-danger-ink)" }}>
                          {c.rejectComment}
                        </p>
                      )}
                    </div>
                    {isLive && (
                      <Chip tone={left <= 7 ? "danger" : left <= 14 ? "warning" : "success"} size="sm">
                        <Clock3 size={11} />
                        {left < 0 ? "expired" : `${left}d to use`}
                      </Chip>
                    )}
                    <StatusChip status={c.status} size="sm" />
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </PageBody>
    </>
  );
}

function Tile({
  label, value, sub, tone, tint,
}: {
  label: string;
  value: string;
  sub: string;
  tone: string;
  tint: string;
}) {
  return (
    <div className="card p-5" style={{ background: tint, borderColor: "transparent" }}>
      <div
        className="flex h-9 w-9 items-center justify-center rounded-xl"
        style={{ background: tone, color: "#fff" }}
      >
        <Gift size={16} />
      </div>
      <p className="eyebrow mt-3.5" style={{ color: tone }}>{label}</p>
      <p className="stat mt-1.5" style={{ fontSize: 32 }}>{value}</p>
      <p className="mt-0.5 text-[12px]" style={{ color: "var(--c-ink-500)" }}>{sub}</p>
    </div>
  );
}
