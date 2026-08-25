import { requireUser } from "@/lib/auth";
import { PageBody, PageHeader } from "@/components/PageHeader";
import { getBalances, getCompOffAvailable, getPolicy } from "@/lib/services/context";
import { leaveYearOf } from "@/lib/policy/leave-year";
import { todayKey } from "@/lib/date";
import { ApplyForm } from "./ApplyForm";
import type { LeaveType } from "@/lib/policy/types";

export const metadata = { title: "Apply for leave" };

export default async function ApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; date?: string }>;
}) {
  const params = await searchParams;
  const user = await requireUser();
  const today = todayKey();
  const cfg = await getPolicy();
  const ly = leaveYearOf(today, cfg);

  const [balances, compOffAvailable] = await Promise.all([
    getBalances(user.id, cfg, ly, today),
    getCompOffAvailable(user.id, today),
  ]);

  // Which types this person can actually choose — gender and probation gate some of them.
  const types: LeaveType[] = ["CL", "SL"];
  if (user.status !== "PROBATION") types.push("PL");
  types.push("COMP_OFF");
  if (user.gender === "FEMALE") types.push("MATERNITY");
  else types.push("PATERNITY");

  const initialType =
    params.type && types.includes(params.type as LeaveType)
      ? (params.type as LeaveType)
      : undefined;

  return (
    <>
      <PageHeader
        title="Apply for leave"
        subtitle="Every rule in the Prismix leave policy is checked as you go — you'll see exactly what's deducted before you submit."
      />
      <PageBody>
        <ApplyForm
          balances={balances.map((b) => ({
            leaveType: b.leaveType,
            available: b.available,
            granted: b.granted,
          }))}
          compOffAvailable={compOffAvailable}
          availableTypes={types}
          gender={user.gender}
          status={user.status}
          initialType={initialType}
          initialStart={/^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "") ? params.date : undefined}
        />
      </PageBody>
    </>
  );
}
