"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { submitRequest } from "@/lib/services/leave";
import { LEAVE_TYPES } from "@/lib/policy/types";
import type { HalfDay, LeaveType } from "@/lib/policy/types";

export type ApplyState = { error?: string };

export async function applyAction(_prev: ApplyState, formData: FormData): Promise<ApplyState> {
  const user = await requireUser();

  const leaveType = String(formData.get("leaveType") ?? "") as LeaveType;
  if (!LEAVE_TYPES.includes(leaveType)) return { error: "Pick a leave type." };

  const start = String(formData.get("start") ?? "");
  const end = String(formData.get("end") ?? "") || start;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return { error: "Pick a start date." };

  const expected = String(formData.get("expectedDelivery") ?? "");
  const pattern = String(formData.get("maternityPattern") ?? "");

  const result = await submitRequest(user.id, {
    leaveType,
    start,
    end,
    halfDay: (String(formData.get("halfDay") ?? "NONE") as HalfDay) || "NONE",
    reason: String(formData.get("reason") ?? ""),
    contactInfo: String(formData.get("contactInfo") ?? ""),
    hasMedicalDoc: formData.get("hasMedicalDoc") === "on",
    medicalDocRef: String(formData.get("medicalDocRef") ?? ""),
    expectedDelivery: /^\d{4}-\d{2}-\d{2}$/.test(expected) ? expected : null,
    maternityPattern: pattern === "SPLIT_8_18" || pattern === "POST_26" ? pattern : null,
  });

  if (!result.ok) return { error: result.error };

  revalidatePath("/");
  revalidatePath("/requests");
  redirect(`/requests/${result.requestId}?applied=1`);
}
