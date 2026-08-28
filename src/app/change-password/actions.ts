"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { hashPassword, requireUser, weakPassword } from "@/lib/auth";
import { audit } from "@/lib/services/activity";

export type FirstPasswordState = { error?: string };

export async function setFirstPasswordAction(
  _prev: FirstPasswordState,
  formData: FormData,
): Promise<FirstPasswordState> {
  const user = await requireUser();
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next !== confirm) return { error: "The two passwords don't match." };
  const weak = weakPassword(next, user.name, user.email);
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
