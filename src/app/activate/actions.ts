"use server";

import { redirect } from "next/navigation";
import { consumeLoginToken, createSession, peekLoginToken, weakPassword, type LoginTokenPurpose } from "@/lib/auth";
import { audit } from "@/lib/services/activity";

export type SetPasswordState = { error?: string };

/** Shared by /activate/[token] and /reset/[token] — the purpose travels as a hidden field. */
export async function setPasswordViaTokenAction(
  _prev: SetPasswordState,
  formData: FormData,
): Promise<SetPasswordState> {
  const token = String(formData.get("token") ?? "");
  const purposeRaw = String(formData.get("purpose") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (purposeRaw !== "ACTIVATE" && purposeRaw !== "RESET") return { error: "This link isn't valid." };
  const purpose = purposeRaw as LoginTokenPurpose;

  if (next !== confirm) return { error: "The two passwords don't match." };

  const check = await peekLoginToken(token, purpose);
  if (!check.ok) return { error: check.error };

  const weak = weakPassword(next, check.name, check.email);
  if (weak) return { error: weak };

  const result = await consumeLoginToken(token, purpose, next);
  if (!result.ok) return { error: result.error };

  await audit({
    actorId: result.userId,
    action: purpose === "ACTIVATE" ? "ACCOUNT_ACTIVATED" : "PASSWORD_SET",
    entity: "User",
    entityId: result.userId,
    summary:
      purpose === "ACTIVATE"
        ? "Activated their account via the emailed sign-in link"
        : "Set a new password via the emailed reset link",
  });

  await createSession(result.userId);
  redirect("/");
}
