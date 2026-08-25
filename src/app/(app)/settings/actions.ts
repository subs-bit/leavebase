"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireHr } from "@/lib/auth";
import { db } from "@/lib/db";
import { fromKey, todayKey } from "@/lib/date";
import { audit } from "@/lib/services/activity";
import { getPolicy, savePolicy } from "@/lib/services/context";
import { detectAbsence, runAccrual, runYearEndRollover } from "@/lib/services/accrual";
import { expireCompOffs } from "@/lib/services/leave";
import { POLICY_FIELDS } from "@/lib/policy/config";
import { createDepartment, deleteDepartment, setDepartmentHod } from "@/lib/services/people";
import { leaveYearOf, shiftLeaveYear } from "@/lib/policy/leave-year";

export type SettingsState = { error?: string; ok?: string };

export async function savePolicyAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const admin = await requireAdmin();
  const current = await getPolicy();
  const next = { ...current };
  const changes: string[] = [];

  for (const f of POLICY_FIELDS) {
    const raw = formData.get(f.key);
    if (raw === null) continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) return { error: `${f.label} must be a number.` };
    if (f.min !== undefined && value < f.min) return { error: `${f.label} can't be below ${f.min}.` };
    if (f.max !== undefined && value > f.max) return { error: `${f.label} can't be above ${f.max}.` };
    if (current[f.key] !== value) {
      changes.push(`${f.label}: ${current[f.key]} → ${value}`);
    }
    // @ts-expect-error — numeric fields only
    next[f.key] = value;
  }

  const weeklyOffs = formData.getAll("weeklyOffs").map((v) => Number(v)).filter((n) => n >= 0 && n <= 6);
  if (weeklyOffs.length === 7) return { error: "At least one day must be a working day." };
  if (JSON.stringify(weeklyOffs.sort()) !== JSON.stringify([...current.weeklyOffs].sort())) {
    changes.push(`Weekly offs: [${current.weeklyOffs}] → [${weeklyOffs}]`);
  }
  next.weeklyOffs = weeklyOffs;

  const accrualCadenceRaw = String(formData.get("accrualCadence") ?? current.accrualCadence);
  if (accrualCadenceRaw !== "QUARTERLY" && accrualCadenceRaw !== "ANNUAL") {
    return { error: "Pick a valid accrual schedule." };
  }
  if (current.accrualCadence !== accrualCadenceRaw) {
    changes.push(
      `Accrual schedule: ${current.accrualCadence === "ANNUAL" ? "all at once" : "quarterly"} → ` +
        `${accrualCadenceRaw === "ANNUAL" ? "all at once" : "quarterly"}`,
    );
  }
  next.accrualCadence = accrualCadenceRaw;

  if (changes.length === 0) return { ok: "Nothing changed." };

  await savePolicy(next);
  await audit({
    actorId: admin.id,
    action: "POLICY_UPDATED",
    entity: "PolicySetting",
    entityId: "singleton",
    summary: `Updated leave policy settings — ${changes.join("; ")}`,
    meta: { changes },
  });

  revalidatePath("/settings");
  revalidatePath("/policy");
  return { ok: `Saved. ${changes.length} setting${changes.length === 1 ? "" : "s"} changed.` };
}

export async function addHolidayAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const hr = await requireHr();
  const date = String(formData.get("date") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "DECLARED");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Pick a date." };
  if (name.length < 2) return { error: "Give the holiday a name." };

  const existing = await db.holiday.findUnique({ where: { date: fromKey(date) } });
  if (existing) return { error: `${date} is already marked as ${existing.name}.` };

  await db.holiday.create({
    data: { date: fromKey(date), name, type, year: Number(date.slice(0, 4)) },
  });
  await audit({
    actorId: hr.id, action: "HOLIDAY_ADDED", entity: "Holiday",
    summary: `Added holiday ${name} on ${date}`,
  });

  revalidatePath("/settings");
  revalidatePath("/calendar");
  return { ok: `${name} added.` };
}

export async function removeHolidayAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const hr = await requireHr();
  const id = String(formData.get("holidayId") ?? "");
  const holiday = await db.holiday.findUnique({ where: { id } });
  if (!holiday) return { error: "Holiday not found." };

  await db.holiday.delete({ where: { id } });
  await audit({
    actorId: hr.id, action: "HOLIDAY_REMOVED", entity: "Holiday",
    summary: `Removed holiday ${holiday.name}`,
  });

  revalidatePath("/settings");
  revalidatePath("/calendar");
  return { ok: `${holiday.name} removed. Existing requests keep the day breakdown they were approved with.` };
}

export async function runMaintenanceAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const admin = await requireAdmin();
  const job = String(formData.get("job") ?? "");
  const today = todayKey();

  if (job === "accrual") {
    const r = await runAccrual({ asOf: today });
    await audit({
      actorId: admin.id, action: "JOB_ACCRUAL", entity: "System",
      summary: `Ran quarterly accrual — ${r.posted} entries across ${r.users} employees`,
    });
    revalidatePath("/settings");
    return { ok: `Accrual complete — ${r.posted} ledger entries posted across ${r.users} employees.` };
  }

  if (job === "expire") {
    const n = await expireCompOffs(today);
    await audit({
      actorId: admin.id, action: "JOB_COMPOFF_EXPIRY", entity: "System",
      summary: `Expired ${n} comp-off credits past their 20-day window`,
    });
    revalidatePath("/settings");
    return { ok: n === 0 ? "No comp-offs were past their window." : `${n} comp-off credit(s) lapsed.` };
  }

  if (job === "absence") {
    const r = await detectAbsence(today);
    await audit({
      actorId: admin.id, action: "JOB_ABSENCE_SCAN", entity: "System",
      summary: `Absence scan raised ${r.flagged} new flags`,
    });
    revalidatePath("/settings");
    revalidatePath("/employees");
    return {
      ok: r.flagged === 0
        ? "No unaccounted absence runs found."
        : `${r.flagged} absence flag(s) raised for HR to review.`,
    };
  }

  if (job === "rollover") {
    const cfg = await getPolicy();
    const nextYear = shiftLeaveYear(leaveYearOf(today, cfg), 1, cfg);
    const r = await runYearEndRollover(nextYear.start, admin.id);
    revalidatePath("/settings");
    return {
      ok: `Rolled ${r.rolled} employees into ${nextYear.label}. ${r.lapsed} days lapsed under §4 and §6.`,
    };
  }

  return { error: "Unknown job." };
}

// ── departments ───────────────────────────────────────────────────────────────

export async function createDepartmentAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const hr = await requireHr();
  const result = await createDepartment(
    String(formData.get("name") ?? ""),
    String(formData.get("code") ?? ""),
    hr.id,
  );
  if (!result.ok) return { error: result.error };
  revalidatePath("/settings");
  revalidatePath("/employees");
  return { ok: "Department added." };
}

export async function setHodAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const hr = await requireHr();
  const departmentId = String(formData.get("departmentId") ?? "");
  const hodId = String(formData.get("hodId") ?? "") || null;

  const result = await setDepartmentHod(departmentId, hodId, hr.id);
  if (!result.ok) return { error: result.error };

  revalidatePath("/settings");
  revalidatePath("/employees");
  return { ok: "Head of department updated." };
}

export async function deleteDepartmentAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const hr = await requireHr();
  const result = await deleteDepartment(String(formData.get("departmentId") ?? ""), hr.id);
  if (!result.ok) return { error: result.error };
  revalidatePath("/settings");
  return { ok: "Department deleted." };
}
