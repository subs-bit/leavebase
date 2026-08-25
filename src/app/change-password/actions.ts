"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { hashPassword, requireUser } from "@/lib/auth";
import { audit } from "@/lib/services/activity";

export type FirstPasswordState = { error?: string };

/** Weak-password guard. Deliberately short — friction here costs adoption, not security. */
function weakness(password: string, name: string, email: string): string | null {
  if (password.length < 8) return "Use at least 8 characters.";
  if (/^\d+$/.test(password)) return "Use more than just numbers.";
  const lower = password.toLowerCase();
  const banned = ["password", "12345678", "qwerty", "leavebase", "prismix", "welcome"];
  if (banned.some((b) => lower.includes(b))) return "That's too easy to guess — pick something else.";
  const first = name.split(" ")[0]?.toLowerCase() ?? "";
  if (first.length > 2 && lower.includes(first)) return "Don't use your own name in the password.";
  if (lower.includes(email.split("@")[0].toLowerCase())) return "Don't use your email name in the password.";
  return null;
}

export async function setFirstPasswordAction(
  _prev: FirstPasswordState,
  formData: FormData,
): Promise<FirstPasswordState> {
  const user = await requireUser();
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next !== confirm) return { error: "The two passwords don't match." };
  const weak = weakness(next, user.name, user.email);
  if (weak) return { error: weak };

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(next), mustChangePassword: false },
  });
  await audit({
    actorId: user.id,
    action: "PASSWORD_SET",
    entity: "User",
    entityId: user.id,
    summary: "Set their own password after signing in with a temporary one",
  });

  redirect("/");
}
