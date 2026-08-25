"use server";

import { revalidatePath } from "next/cache";
import { requireUser, hashPassword, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/services/activity";

export type ProfileState = { error?: string; ok?: string };

export async function updateProfileAction(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const user = await requireUser();
  const phone = String(formData.get("phone") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();

  if (phone.length > 24) return { error: "That phone number looks too long." };

  await db.user.update({ where: { id: user.id }, data: { phone, location } });
  revalidatePath("/profile");
  return { ok: "Saved." };
}

export async function changePasswordAction(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const user = await requireUser();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next.length < 8) return { error: "Use at least 8 characters." };
  if (next !== confirm) return { error: "The two new passwords don't match." };

  const row = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!(await verifyPassword(current, row.passwordHash))) {
    return { error: "Your current password isn't right." };
  }

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(next) },
  });
  // Force other devices to sign in again.
  await db.session.deleteMany({ where: { userId: user.id } });
  await audit({
    actorId: user.id, action: "PASSWORD_CHANGED", entity: "User", entityId: user.id,
    summary: "Changed their password; other sessions signed out",
  });

  return { ok: "Password changed. Other devices have been signed out." };
}
