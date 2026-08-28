"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, recordLogin, verifyPassword } from "@/lib/auth";
import { checkRate, clearRate, recordFailure } from "@/lib/rate-limit";
import { audit } from "@/lib/services/activity";
import { runMaintenance } from "@/lib/services/accrual";

export type LoginState = { error?: string };

async function clientKey(email: string): Promise<string> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "local";
  return `${ip}|${email}`;
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Enter your email and password." };

  const key = await clientKey(email);
  const gate = checkRate(key);
  if (!gate.allowed) {
    const mins = Math.ceil(gate.retryAfterSeconds / 60);
    return { error: `Too many attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.` };
  }

  const user = await db.user.findUnique({ where: { email } });
  // Same message either way — never reveal which accounts exist.
  if (!user || !user.isActive || !(await verifyPassword(password, user.passwordHash))) {
    const next = recordFailure(key);
    if (!next.allowed) {
      const mins = Math.ceil(next.retryAfterSeconds / 60);
      return {
        error: `That didn't match, and there have been too many attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`,
      };
    }
    return { error: "That email and password don't match an active account." };
  }

  clearRate(key);
  const { isFirstLogin } = await recordLogin(user.id);
  await createSession(user.id);
  await audit({ actorId: user.id, action: "SIGN_IN", entity: "User", entityId: user.id, summary: "Signed in" });
  // §7 accrual is posted opportunistically rather than depending on a scheduler.
  await runMaintenance(user.id);

  // Only once they've actually finished setting a real password — signing in with a still-live
  // temporary one isn't "activated" yet, and mustChangePassword forces that step next regardless.
  if (isFirstLogin && !user.mustChangePassword) {
    const { notifyFirstLogin } = await import("@/lib/email/context");
    await notifyFirstLogin(user.id).catch(() => {});
  }

  if (user.mustChangePassword) redirect("/change-password");
  redirect("/");
}
