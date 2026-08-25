"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { claimCompOff, decideCompOff } from "@/lib/services/leave";

export type CompOffState = { error?: string; ok?: boolean };

export async function claimAction(_prev: CompOffState, formData: FormData): Promise<CompOffState> {
  const user = await requireUser();
  const workedDate = String(formData.get("workedDate") ?? "");
  const reason = String(formData.get("reason") ?? "");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(workedDate)) return { error: "Pick the day you worked." };

  const result = await claimCompOff(user.id, workedDate, reason);
  if (!result.ok) return { error: result.error };

  revalidatePath("/comp-off");
  revalidatePath("/");
  return { ok: true };
}

export async function compOffDecisionAction(
  _prev: CompOffState,
  formData: FormData,
): Promise<CompOffState> {
  const user = await requireUser();
  const creditId = String(formData.get("creditId") ?? "");
  const action = String(formData.get("action") ?? "");
  const comment = String(formData.get("comment") ?? "");

  if (action !== "APPROVED" && action !== "REJECTED") return { error: "Unknown action." };
  if (action === "REJECTED" && !comment.trim()) return { error: "Give a reason for rejecting." };

  const result = await decideCompOff(creditId, user.id, action, comment);
  if (!result.ok) return { error: result.error };

  revalidatePath("/comp-off");
  revalidatePath("/approvals");
  revalidatePath("/");
  return { ok: true };
}
