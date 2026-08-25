import Link from "next/link";
import { FileText, Download } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { PageBody, PageHeader } from "@/components/PageHeader";
import { Chip, leaveInk, leaveTint } from "@/components/ui/primitives";
import { getPolicy } from "@/lib/services/context";
import { fmtDate, todayKey } from "@/lib/date";
import { leaveYearOf } from "@/lib/policy/leave-year";
import { LEAVE_META } from "@/lib/policy/types";

export const metadata = { title: "Leave policy" };

export default async function PolicyPage() {
  await requireUser();
  const cfg = await getPolicy();
  const ly = leaveYearOf(todayKey(), cfg);

  const sections: {
    n: string;
    title: string;
    body: React.ReactNode;
    type?: keyof typeof LEAVE_META;
  }[] = [
    {
      n: "§1–2", title: "Purpose and scope",
      body: (
        <>
          <p>
            A uniform framework for leave across Prismix Studios, covering everyone on the direct
            payroll — full-time, part-time, fixed-term and contract employees, and consultants
            engaged full-time — across all locations in India.
          </p>
          <p>
            It does not cover people engaged through third-party agencies, manpower contractors or
            vendors.
          </p>
        </>
      ),
    },
    {
      n: "§3", title: "Policy year",
      body: (
        <>
          <p>
            Leave is computed on the financial year: <Strong>1 April to 31 March</Strong>. The
            current leave year is <Strong>{ly.label}</Strong>, running {fmtDate(ly.start)} to{" "}
            {fmtDate(ly.end)}. The policy is effective from {fmtDate(cfg.effectiveFrom)}.
          </p>
        </>
      ),
    },
    {
      n: "§4", title: "Casual Leave", type: "CL",
      body: (
        <>
          <p>
            <Strong>{cfg.clPerYear} days</Strong> a year, pro-rated to your period of service, for
            casual, general or unforeseen situations — not for long vacations.
          </p>
          <p>
            Casual Leave <Strong>does not carry forward</Strong> and lapses automatically on 31
            March. It is non-encashable. If you leave having taken more than your pro-rata
            entitlement, the excess is recovered in the full and final settlement.
          </p>
        </>
      ),
    },
    {
      n: "§5", title: "Sick Leave", type: "SL",
      body: (
        <>
          <p>
            <Strong>{cfg.slPerYear} days</Strong> a year for medical reasons, pro-rated to your
            tenure. It is the only leave type that does not need prior approval — you can apply for
            it retrospectively.
          </p>
          <p>
            More than <Strong>{cfg.slMedicalDocAfter} consecutive days</Strong> requires medical
            documents submitted to HR. Without them, the leave is deducted from your Privileged
            Leave instead.
          </p>
          <p>
            Sick Leave carries forward without limit, but is never cashable — during employment or
            on separation.
          </p>
        </>
      ),
    },
    {
      n: "§6", title: "Privileged Leave", type: "PL",
      body: (
        <>
          <p>
            <Strong>{cfg.plPerYear} days</Strong> a year for confirmed employees. Employees on
            probation are not entitled to it until confirmation.
          </p>
          <p>
            Up to <Strong>{cfg.plShortRunMax} consecutive days</Strong> must be applied for and
            approved at least <Strong>{cfg.plNoticeShort} days in advance</Strong>. More than that
            needs <Strong>{cfg.plNoticeLong} days' notice</Strong> and approval from both your
            reporting manager and the head of department.
          </p>
          <p>
            Holidays and weekly offs falling inside a stretch of Privileged Leave count as part of
            it. Unused Privileged Leave carries forward, but the balance can never exceed{" "}
            <Strong>{cfg.plAccumulationCap} days</Strong> — anything above the ceiling lapses. It is
            not cashable under any circumstances.
          </p>
        </>
      ),
    },
    {
      n: "§7", title: "How leave accrues",
      body: (
        <>
          <p>
            Leave is credited <Strong>at the start of each quarter</Strong>, pro-rated to the part
            of the quarter you were eligible for it.
          </p>
          <p>
            On probation, only Casual and Sick Leave accrue. Privileged Leave is credited on
            successful confirmation, pro-rated for the eligible period.
          </p>
        </>
      ),
    },
    {
      n: "§8", title: "General rules",
      body: (
        <>
          <p>
            <Strong>Sick, Casual and Privileged Leave cannot be clubbed.</Strong> Each request
            carries one type, and one type cannot run directly into another.
          </p>
          <p>
            <Strong>Intervening weekly offs and holidays.</Strong> Where you take leave immediately
            before and immediately after a weekly off or declared holiday, the days in between are
            also treated as leave and deducted from your balance. If you're on leave on a Saturday
            and the following Monday, the Sunday counts too.
          </p>
          <p>
            It is your responsibility to apply in advance and get approval. An absence that wasn't
            applied for is treated as absence and leads to Loss of Pay.
          </p>
        </>
      ),
    },
    {
      n: "§9", title: "Maternity Leave", type: "MATERNITY",
      body: (
        <>
          <p>
            Female employees are entitled to a maximum of{" "}
            <Strong>{cfg.maternityPreWeeks} weeks before delivery</Strong> and{" "}
            <Strong>{cfg.maternityPostWeeks} weeks after</Strong>, or the entire{" "}
            <Strong>{cfg.maternityTotalWeeks} weeks after delivery</Strong>.
          </p>
          <p>
            HR must be informed in writing at least{" "}
            <Strong>{Math.round(cfg.maternityNoticeDays / 30)} months</Strong> before you proceed on
            leave, supported by a medical certificate stating the expected date of childbirth.
            Weekly offs and holidays in this period count as part of the leave. It is non-cashable
            and paid on the normal payroll cycle.
          </p>
        </>
      ),
    },
    {
      n: "§10", title: "Paternity Leave", type: "PATERNITY",
      body: (
        <p>
          Biological fathers are entitled to <Strong>{cfg.paternityDays} days</Strong> for the care
          of their newborn child and spouse. Non-cashable.
        </p>
      ),
    },
    {
      n: "§11", title: "Compensatory off", type: "COMP_OFF",
      body: (
        <>
          <p>
            Working a national holiday, a declared holiday or a weekly off{" "}
            <Strong>with prior approval from your reporting manager</Strong> earns a compensatory
            off.
          </p>
          <p>
            Raise a claim against the day you worked. Once your manager approves it, a credit
            appears in your leave account, and you must avail it within{" "}
            <Strong>{cfg.compOffExpiryDays} days</Strong> of the day worked or it lapses. Availing
            it is itself a request your manager approves. A maximum of{" "}
            <Strong>{cfg.compOffMaxPerYear}</Strong> compensatory offs may be availed in a year.
          </p>
        </>
      ),
    },
    {
      n: "§12–13", title: "Unauthorised absence and Loss of Pay", type: "LOP",
      body: (
        <>
          <p>
            Absence without approval is treated as Leave Without Pay. Uninformed or unauthorised
            absence for <Strong>{cfg.abscondingDays} consecutive working days or more</Strong> is
            treated as absconding and results in automatic termination of employment, with the
            company reserving the right to recover the notice-period shortfall from the full and
            final settlement.
          </p>
          <p>
            During Loss of Pay you are not entitled to pay or allowances. Approved leave taken
            without available balance is also treated as Loss of Pay.
          </p>
        </>
      ),
    },
    {
      n: "§14", title: "Half-day leave",
      body: (
        <p>
          A half-day is either the <Strong>first four hours</Strong> or the{" "}
          <Strong>last four hours</Strong> of the workday, and counts as half a day against your
          balance.
        </p>
      ),
    },
    {
      n: "§15–16", title: "Applying and cancelling",
      body: (
        <>
          <p>
            Apply in advance and obtain prior approval for every type except Sick Leave. Reporting
            authorities may approve or reject on professional grounds. Any absence not applied for
            and approved is unauthorised leave and results in Loss of Pay.
          </p>
          <p>
            In extraordinary situations your reporting manager or department head may cancel leave
            that has already been sanctioned. If you proceed to take cancelled leave, the absence is
            treated as unauthorised.
          </p>
        </>
      ),
    },
    {
      n: "§17", title: "Leaving the company",
      body: (
        <>
          <p>
            Casual or Privileged Leave availed beyond your pro-rata entitlement is recovered in the
            full and final settlement. Privileged, Casual and Sick Leave are not cashable.
          </p>
          <p>
            If you have resigned, you may not avail leave before your last working day without prior
            approval from both your reporting manager and the head of department. Leave cannot be
            adjusted against the notice period unless the head of department, head of HR and the CEO
            all approve.
          </p>
        </>
      ),
    },
    {
      n: "§18", title: "For reporting managers",
      body: (
        <>
          <p>
            Keep operational coverage — no more than{" "}
            <Strong>{cfg.maxConcurrentPerTeam} team members</Strong> approved for leave on the same
            day. Check balances and dates proactively to avoid scheduling conflicts. Decide on
            business need and the merit of the request, in line with this policy.
          </p>
          <p>
            Communicate decisions clearly and promptly so people can plan, be consistent regardless
            of personal preference, and keep a record of each approval. LeaveBase records every
            decision automatically, with a timestamp and the reason given.
          </p>
        </>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Leave policy"
        subtitle="Prismix Studios · effective 1 July 2026 · this is what LeaveBase enforces"
        actions={
          <a
            href="/api/policy-document"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost hidden sm:inline-flex"
          >
            <Download size={15} />
            Original PDF
          </a>
        }
      />

      <PageBody className="space-y-5">
        <section
          className="prism-panel p-6 sm:p-7"
          style={{ borderRadius: 28, boxShadow: "var(--sh-glow)" }}
        >
          <div className="relative z-10 max-w-2xl">
            <p className="eyebrow" style={{ color: "rgba(255,255,255,.78)" }}>
              Your entitlement at a glance
            </p>
            <div className="mt-4 flex flex-wrap gap-6">
              {(["CL", "SL", "PL"] as const).map((t) => (
                <div key={t}>
                  <p className="stat" style={{ fontSize: 40, color: "#fff" }}>
                    {t === "CL" ? cfg.clPerYear : t === "SL" ? cfg.slPerYear : cfg.plPerYear}
                  </p>
                  <p className="text-[12.5px] font-bold" style={{ color: "rgba(255,255,255,.85)" }}>
                    {LEAVE_META[t].name}
                  </p>
                  <p className="text-[11px]" style={{ color: "rgba(255,255,255,.65)" }}>
                    days a year
                  </p>
                </div>
              ))}
              <div>
                <p className="stat" style={{ fontSize: 40, color: "#fff" }}>
                  {cfg.plAccumulationCap}
                </p>
                <p className="text-[12.5px] font-bold" style={{ color: "rgba(255,255,255,.85)" }}>
                  PL ceiling
                </p>
                <p className="text-[11px]" style={{ color: "rgba(255,255,255,.65)" }}>
                  days maximum
                </p>
              </div>
            </div>
            <p className="mt-5 text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,.82)" }}>
              Every rule below is enforced live when you apply — LeaveBase shows you which clause
              applies before you submit, not after someone rejects you.
            </p>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          {sections.map((s) => (
            <section key={s.n} className="card p-5 sm:p-6">
              <div className="flex items-center gap-2.5">
                <span
                  className="rounded-lg px-2 py-1 text-[11px] font-extrabold"
                  style={{
                    background: s.type ? leaveTint(s.type) : "var(--c-ink-100)",
                    color: s.type ? leaveInk(s.type) : "var(--c-ink-500)",
                  }}
                >
                  {s.n}
                </span>
                <h2 className="text-[16px]">{s.title}</h2>
              </div>
              <div
                className="mt-3 space-y-2.5 text-[13px] leading-relaxed"
                style={{ color: "var(--c-ink-700)" }}
              >
                {s.body}
              </div>
            </section>
          ))}
        </div>

        <section className="card p-5" style={{ background: "var(--c-info-tint)", borderColor: "transparent" }}>
          <div className="flex items-start gap-3">
            <FileText size={18} style={{ color: "var(--c-info-ink)", marginTop: 2 }} />
            <div>
              <p className="text-[13.5px] font-bold" style={{ color: "var(--c-info-ink)" }}>
                One drafting note, carried openly
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: "var(--c-ink-700)" }}>
                §4 of the source document reads &ldquo;Six (04) Casual Leaves&rdquo; — the word and
                the numeral disagree. Prismix confirmed the intent as{" "}
                <Strong>{cfg.clPerYear}</Strong>, and LeaveBase holds it as a setting HR can correct
                without a code change. §4–6 also say &ldquo;calendar year&rdquo; while §3 defines the
                policy year as the financial year; LeaveBase follows §3 throughout, so all
                entitlement runs April to March.
              </p>
              <Link
                href="/settings"
                className="mt-2.5 inline-block text-[12px] font-bold"
                style={{ color: "var(--brand-500)" }}
              >
                See the configured values →
              </Link>
            </div>
          </div>
        </section>
      </PageBody>
    </>
  );
}

function Strong({ children }: { children: React.ReactNode }) {
  return (
    <strong className="font-extrabold" style={{ color: "var(--c-ink-900)" }}>
      {children}
    </strong>
  );
}
