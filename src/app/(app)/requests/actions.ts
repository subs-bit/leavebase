"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin, requireUser } from "@/lib/auth";
import {
  cancelRequest, decideRequest, deleteRequestPermanently, reassignLeaveType,
} from "@/lib/services/leave";
import { NON_CLUBBABLE } from "@/lib/policy/types";
import type { LeaveType } from "@/lib/policy/types";

export type ActionState = { error?: string; ok?: boolean };

export async function decideAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const requestId = String(formData.get("requestId") ?? "");
  const action = String(formData.get("action") ?? "");
  const comment = String(formData.get("comment") ?? "");

  if (action !== "APPROVED" && action !== "REJECTED") return { error: "Unknown action." };

  const result = await decideRequest(requestId, user.id, action, comment);
  if (!result.ok) return { error: result.error };

  revalidatePath("/approvals");
  revalidatePath("/requests");
  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/");
  return { ok: true };
}

export async function cancelAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const requestId = String(formData.get("requestId") ?? "");
  const reason = String(formData.get("reason") ?? "");

  const result = await cancelRequest(requestId, user.id, reason);
  if (!result.ok) return { error: result.error };

  revalidatePath("/requests");
  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/");
  return { ok: true };
}

export async function reassignAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const requestId = String(formData.get("requestId") ?? "");
  const newType = String(formData.get("newType") ?? "");
  const reason = String(formData.get("reason") ?? "");

  if (!NON_CLUBBABLE.includes(newType as LeaveType)) return { error: "Pick a valid leave type." };

  const result = await reassignLeaveType(requestId, newType as LeaveType, admin.id, reason);
  if (!result.ok) return { error: result.error };

  revalidatePath("/requests");
  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/employees");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const requestId = String(formData.get("requestId") ?? "");
  const reason = String(formData.get("reason") ?? "");

  const result = await deleteRequestPermanently(requestId, admin.id, reason);
  if (!result.ok) return { error: result.error };

  revalidatePath("/requests");
  revalidatePath("/employees");
  revalidatePath("/");
  redirect("/requests?deleted=1");
}
