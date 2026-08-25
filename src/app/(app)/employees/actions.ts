"use server";

import { revalidatePath } from "next/cache";
import { requireHr } from "@/lib/auth";
import {
  createEmployee, resetPassword, setEmployeeActive, updateEmployee, type PersonInput,
} from "@/lib/services/people";
import { BALANCE_TYPES } from "@/lib/policy/types";
import type { LeaveType, Role } from "@/lib/policy/types";

export type PeopleState = { error?: string; ok?: string; tempPassword?: string; userId?: string };

function readPerson(formData: FormData): PersonInput {
  const confirmDate = String(formData.get("confirmDate") ?? "");
  return {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    empCode: String(formData.get("empCode") ?? "") || undefined,
    designation: String(formData.get("designation") ?? ""),
    role: String(formData.get("role") ?? "EMPLOYEE") as Role,
    gender: String(formData.get("gender") ?? "UNSPECIFIED"),
    employmentType: String(formData.get("employmentType") ?? "FULL_TIME"),
    status: String(formData.get("status") ?? "PROBATION"),
    joinDate: String(formData.get("joinDate") ?? ""),
    confirmDate: /^\d{4}-\d{2}-\d{2}$/.test(confirmDate) ? confirmDate : null,
    departmentId: String(formData.get("departmentId") ?? "") || null,
    managerId: String(formData.get("managerId") ?? "") || null,
    phone: String(formData.get("phone") ?? ""),
    location: String(formData.get("location") ?? ""),
  };
}

function readOpeningBalances(formData: FormData): Partial<Record<LeaveType, number>> {
  const out: Partial<Record<LeaveType, number>> = {};
  for (const type of BALANCE_TYPES) {
    const raw = formData.get(`opening_${type}`);
    if (raw === null || String(raw).trim() === "") continue;
    const n = Number(raw);
    if (Number.isFinite(n) && n !== 0) out[type] = n;
  }
  return out;
}

export async function createPersonAction(
  _prev: PeopleState,
  formData: FormData,
): Promise<PeopleState> {
  const actor = await requireHr();
  const result = await createEmployee(readPerson(formData), actor, {
    openingBalances: readOpeningBalances(formData),
  });
  if (!result.ok) return { error: result.error };

  revalidatePath("/employees");
  revalidatePath("/reports");
  return {
    ok: "Added. Give them the temporary password below — LeaveBase will make them change it at first sign-in.",
    tempPassword: result.tempPassword,
    userId: result.userId,
  };
}

export async function updatePersonAction(
  _prev: PeopleState,
  formData: FormData,
): Promise<PeopleState> {
  const actor = await requireHr();
  const userId = String(formData.get("userId") ?? "");
  const result = await updateEmployee(userId, readPerson(formData), actor);
  if (!result.ok) return { error: result.error };

  revalidatePath("/employees");
  revalidatePath(`/employees/${userId}`);
  return { ok: "Saved." };
}

export async function setActiveAction(_prev: PeopleState, formData: FormData): Promise<PeopleState> {
  const actor = await requireHr();
  const userId = String(formData.get("userId") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  const reason = String(formData.get("reason") ?? "").trim();

  if (!reason) return { error: "Record why." };

  const result = await setEmployeeActive(userId, active, actor, reason);
  if (!result.ok) return { error: result.error };

  revalidatePath("/employees");
  revalidatePath(`/employees/${userId}`);
  return { ok: active ? "Reactivated." : "Deactivated. Their history and audit trail are kept." };
}

export async function resetPasswordAction(
  _prev: PeopleState,
  formData: FormData,
): Promise<PeopleState> {
  const actor = await requireHr();
  const userId = String(formData.get("userId") ?? "");
  const result = await resetPassword(userId, actor);
  if (!result.ok) return { error: result.error };

  revalidatePath(`/employees/${userId}`);
  return {
    ok: "Temporary password issued. They've been signed out everywhere and must set a new one.",
    tempPassword: result.tempPassword,
  };
}
