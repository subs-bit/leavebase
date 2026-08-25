import Link from "next/link";
import { LogOut } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageBody, PageHeader } from "@/components/PageHeader";
import { BalanceBar } from "@/components/ui/BalanceRing";
import { Avatar, Chip, SectionHeader, leaveInk, leaveName } from "@/components/ui/primitives";
import { ContactForm, PasswordForm } from "./ProfileForms";
import { dayKey, fmtDate, todayKey } from "@/lib/date";
import { getBalances, getCompOffAvailable, getPolicy } from "@/lib/services/context";
import { leaveYearOf } from "@/lib/policy/leave-year";
import {
  BALANCE_TYPES, EMPLOYMENT_STATUS_LABEL, EMPLOYMENT_TYPE_LABEL, ROLE_LABEL,
} from "@/lib/policy/types";
import type { Role } from "@/lib/policy/types";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await requireUser();
  const today = todayKey();
  const cfg = await getPolicy();
  const ly = leaveYearOf(today, cfg);

  const [me, balances, compAvailable] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: user.id },
      include: {
        department: { select: { name: true } },
        manager: { select: { id: true, name: true, avatarHue: true, designation: true } },
      },
    }),
    getBalances(user.id, cfg, ly, today),
    getCompOffAvailable(user.id, today),
  ]);

  return (
    <>
      <PageHeader title="Your profile" subtitle={`${me.designation} · ${me.empCode}`} />

      <PageBody className="grid gap-5 lg:grid-cols-[1fr_1.4fr] lg:items-start">
        <div className="space-y-5">
          <section className="card overflow-hidden">
            <div
              className="h-24"
              style={{
                background: `linear-gradient(135deg, hsl(${me.avatarHue} 84% 88%), hsl(${(me.avatarHue + 45) % 360} 80% 84%))`,
              }}
            />
            <div className="px-5 pb-5">
              <div className="-mt-10 mb-3">
                <Avatar name={me.name} hue={me.avatarHue} size={76} ring />
              </div>
              <h2 className="text-[19px]">{me.name}</h2>
              <p className="text-[13px]" style={{ color: "var(--c-ink-500)" }}>{me.email}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Chip tone={me.status === "CONFIRMED" ? "success" : "warning"} size="sm">
                  {EMPLOYMENT_STATUS_LABEL[me.status]}
                </Chip>
                <Chip tone="brand" size="sm">{ROLE_LABEL[me.role as Role]}</Chip>
                <Chip tone="neutral" size="sm">{EMPLOYMENT_TYPE_LABEL[me.employmentType]}</Chip>
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-4 border-t pt-4" style={{ borderColor: "var(--c-border)" }}>
                <Field label="Department" value={me.department?.name ?? "—"} />
                <Field label="Employee code" value={me.empCode} />
                <Field label="Joined" value={fmtDate(dayKey(me.joinDate))} />
                <Field
                  label="Confirmed"
                  value={me.confirmDate ? fmtDate(dayKey(me.confirmDate)) : "On probation"}
                />
              </dl>

              {me.manager && (
                <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--c-border)" }}>
                  <p className="eyebrow mb-2.5">Your leave goes to</p>
                  <div className="flex items-center gap-3">
                    <Avatar name={me.manager.name} hue={me.manager.avatarHue} size={34} />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-bold" style={{ color: "var(--c-ink-900)" }}>
                        {me.manager.name}
                      </p>
                      <p className="truncate text-[11.5px]" style={{ color: "var(--c-ink-400)" }}>
                        {me.manager.designation}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="card p-5">
            <SectionHeader eyebrow={`Leave year ${ly.label}`} title="Your balances" />
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
                    label={leaveName(t)}
                  />
                );
              })}
            </div>
            <Link
              href="/requests?tab=balance"
              className="btn btn-ghost mt-5 w-full"
              style={{ padding: "8px 14px" }}
            >
              Full statement
            </Link>
          </section>
        </div>

        <div className="space-y-5">
          <section className="card p-5 sm:p-6">
            <SectionHeader eyebrow="Contact" title="How we reach you" />
            <div className="mt-4">
              <ContactForm phone={me.phone} location={me.location} />
            </div>
          </section>

          <section className="card p-5 sm:p-6">
            <SectionHeader eyebrow="Security" title="Password" />
            <div className="mt-4">
              <PasswordForm />
            </div>
          </section>

          <section className="card p-5 sm:p-6">
            <SectionHeader eyebrow="Session" title="Sign out" />
            <p className="mt-2 text-[13px]" style={{ color: "var(--c-ink-500)" }}>
              You'll need to sign in again on this device.
            </p>
            <form action="/api/logout" method="post" className="mt-4">
              <button type="submit" className="btn btn-ghost">
                <LogOut size={15} />
                Sign out
              </button>
            </form>
          </section>
        </div>
      </PageBody>
    </>
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
