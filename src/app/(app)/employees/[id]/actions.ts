"use server";

import { revalidatePath } from "next/cache";
import { requireHr } from "@/lib/auth";
import { db } from "@/lib/db";
import { fromKey, todayKey } from "@/lib/date";
import { audit, notify } from "@/lib/services/activity";
import { getPolicy } from "@/lib/services/context";
import { runAccrual } from "@/lib/services/accrual";
import { leaveYearOf } from "@/lib/policy/leave-year";
import { LEAVE_META } from "@/lib/policy/types";
import type { LeaveType } from "@/lib/policy/types";

export type HrState = { error?: string; ok?: string };

/** Manual balance correction. A reason is mandatory — the ledger must always explain itself. */
export async function adjustBalanceAction(_prev: HrState, formData: FormData): Promise<HrState> {
  const hr = await requireHr();
  const userId = String(formData.get("userId") ?? "");
  const leaveType = String(formData.get("leaveType") ?? "") as LeaveType;
  const amount = Number(formData.get("amount"));
  const note = String(formData.get("note") ?? "").trim();

  if (!LEAVE_META[leaveType]) return { error: "Pick a leave type." };
  if (!Number.isFinite(amount) || amount === 0) return { error: "Enter a non-zero number of days." };
  if (Math.abs(amount) > 60) return { error: "That adjustment looks too large — cap is 60 days." };
  if (note.length < 4) return { error: "Record why this adjustment is being made." };

  const cfg = await getPolicy();
  const today = todayKey();
  const ly = leaveYearOf(today, cfg);

  await db.leaveLedger.create({
    data: {
      userId,
      leaveYear: ly.label,
      leaveType,
      entryKind: "ADJUSTMENT",
      amount,
      effectiveDate: fromKey(today),
      actorId: hr.id,
      ruleId: "HR.ADJUSTMENT",
      note,
    },
  });

  const target = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  await audit({
    actorId: hr.id,
    action: "BALANCE_ADJUSTED",
    entity: "User",
    entityId: userId,
    summary: `Adjusted ${target?.name}'s ${LEAVE_META[leaveType].name} by ${amount > 0 ? "+" : ""}${amount} — ${note}`,
    meta: { leaveType, amount },
  });
  await notify({
    userId,
    kind: "BALANCE_LAPSE",
    title: `Your ${LEAVE_META[leaveType].name} balance was adjusted`,
    body: `${amount > 0 ? "+" : ""}${amount} days — ${note}`,
    link: "/requests?tab=balance",
  });

  revalidatePath(`/employees/${userId}`);
  return { ok: `Adjusted by ${amount > 0 ? "+" : ""}${amount} days.` };
}

/** §7 ACCRUAL.PL_ON_CONFIRM — confirming an employee opens Privileged Leave to them. */
export async function confirmEmployeeAction(_prev: HrState, formData: FormData): Promise<HrState> {
  const hr = await requireHr();
  const userId = String(formData.get("userId") ?? "");
  const confirmDate = String(formData.get("confirmDate") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(confirmDate)) return { error: "Pick a confirmation date." };

  const target = await db.user.findUnique({ where: { id: userId }, select: { name: true, status: true } });
  if (!target) return { error: "Employee not found." };

  await db.user.update({
    where: { id: userId },
    data: { status: "CONFIRMED", confirmDate: fromKey(confirmDate) },
  });

  // Credit the PL that confirmation unlocks, pro-rata for the eligible period.
  await runAccrual({ userId });

  await audit({
    actorId: hr.id,
    action: "EMPLOYEE_CONFIRMED",
    entity: "User",
    entityId: userId,
    summary: `Confirmed ${target.name} with effect from ${confirmDate}; Privileged Leave credited pro-rata (§7)`,
  });
  await notify({
    userId,
    kind: "APPROVED",
    title: "You've been confirmed",
    body: "Privileged Leave is now available to you, credited pro-rata from your confirmation date (§6, §7).",
    link: "/requests?tab=balance",
  });

  revalidatePath(`/employees/${userId}`);
  return { ok: "Confirmed. Privileged Leave has been credited pro-rata." };
}

/** §17 — record a resignation so exit rules start applying. */
export async function recordExitAction(_prev: HrState, formData: FormData): Promise<HrState> {
  const hr = await requireHr();
  const userId = String(formData.get("userId") ?? "");
  const resignDate = String(formData.get("resignDate") ?? "");
  const lastWorkingDay = String(formData.get("lastWorkingDay") ?? "");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(resignDate)) return { error: "Pick the resignation date." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lastWorkingDay)) return { error: "Pick the last working day." };
  if (lastWorkingDay < resignDate) return { error: "The last working day can't precede the resignation." };

  const target = await db.user.findUnique({ where: { id: userId }, select: { name: true } });

  await db.user.update({
    where: { id: userId },
    data: {
      status: "RESIGNED",
      resignDate: fromKey(resignDate),
      lastWorkingDay: fromKey(lastWorkingDay),
    },
  });

  await audit({
    actorId: hr.id,
    action: "EXIT_RECORDED",
    entity: "User",
    entityId: userId,
    summary: `Recorded ${target?.name}'s resignation — last working day ${lastWorkingDay} (§17)`,
  });

  revalidatePath(`/employees/${userId}`);
  return { ok: "Recorded. Exit rules under §17 now apply to this employee." };
}

/** §12/§13 — mark days an employee was absent without approval. */
export async function recordAbsenceAction(_prev: HrState, formData: FormData): Promise<HrState> {
  const hr = await requireHr();
  const userId = String(formData.get("userId") ?? "");
  const from = String(formData.get("from") ?? "");
  const to = String(formData.get("to") ?? "") || from;
  const note = String(formData.get("note") ?? "");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return { error: "Pick the first day of the absence." };

  const { recordUnauthorisedAbsence } = await import("@/lib/services/accrual");
  const result = await recordUnauthorisedAbsence({ userId, from, to, note, actorId: hr.id });
  if (!result.ok) return { error: result.error };

  revalidatePath(`/employees/${userId}`);
  revalidatePath("/employees");
  revalidatePath("/reports");
  return {
    ok: `Recorded ${result.days} day(s) of unauthorised absence as Loss of Pay under §13.`,
  };
}

export async function resolveFlagAction(_prev: HrState, formData: FormData): Promise<HrState> {
  const hr = await requireHr();
  const flagId = String(formData.get("flagId") ?? "");
  const resolution = String(formData.get("resolution") ?? "").trim();
  const outcome = String(formData.get("outcome") ?? "RESOLVED");
  if (resolution.length < 4) return { error: "Record what was decided." };

  const flag = await db.absenceFlag.update({
    where: { id: flagId },
    data: { status: outcome === "DISMISSED" ? "DISMISSED" : "RESOLVED", resolution },
    include: { user: { select: { id: true, name: true } } },
  });

  await audit({
    actorId: hr.id,
    action: "ABSENCE_FLAG_CLOSED",
    entity: "AbsenceFlag",
    entityId: flagId,
    summary: `Closed absence flag for ${flag.user.name} — ${resolution}`,
  });

  revalidatePath(`/employees/${flag.user.id}`);
  revalidatePath("/employees");
  return { ok: "Flag closed." };
}
