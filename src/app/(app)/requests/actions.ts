"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { cancelRequest, decideRequest } from "@/lib/services/leave";

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
