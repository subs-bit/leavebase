"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, hashPassword } from "@/lib/auth";
import { audit } from "@/lib/services/activity";
import { savePolicy } from "@/lib/services/context";
import { DEFAULT_POLICY } from "@/lib/policy/config";
import { fromKey, todayKey } from "@/lib/date";

export type SetupState = { error?: string };

/** True only while the instance has no accounts at all. */
export async function isUnclaimed(): Promise<boolean> {
  return (await db.user.count()) === 0;
}

export async function completeSetupAction(
  _prev: SetupState,
  formData: FormData,
): Promise<SetupState> {
  // The setup route only works on an instance with no accounts — otherwise anyone could
  // visit /setup and mint themselves an administrator.
  if (!(await isUnclaimed())) {
    return { error: "This LeaveBase is already set up. Sign in instead." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const designation = String(formData.get("designation") ?? "").trim();
  const joinDate = String(formData.get("joinDate") ?? "");
  const departmentsRaw = String(formData.get("departments") ?? "");

  if (name.length < 2) return { error: "Enter your full name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid work email." };
  if (password.length < 8) return { error: "Use a password of at least 8 characters." };
  if (password !== confirm) return { error: "The two passwords don't match." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(joinDate)) return { error: "Pick your joining date." };

  const user = await db.user.create({
    data: {
      empCode: "PRX001",
      name,
      email,
      passwordHash: await hashPassword(password),
      mustChangePassword: false,
      role: "ADMIN",
      designation: designation || "Administrator",
      status: "CONFIRMED",
      joinDate: fromKey(joinDate),
      confirmDate: fromKey(joinDate),
      avatarHue: 262,
    },
  });

  // Departments, if they listed any.
  const names = departmentsRaw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
  const usedCodes = new Set<string>();
  for (const deptName of names) {
    const base = deptName.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 4) || "DEP";
    let code = base;
    for (let i = 2; usedCodes.has(code); i++) code = `${base}${i}`;
    usedCodes.add(code);
    await db.department.create({ data: { name: deptName, code } }).catch(() => {});
  }

  await savePolicy(DEFAULT_POLICY);
  await audit({
    actorId: user.id,
    action: "INSTANCE_SETUP",
    entity: "User",
    entityId: user.id,
    summary: `Set up LeaveBase — ${name} is the first administrator${names.length ? `; created ${names.length} departments` : ""}`,
  });

  await createSession(user.id);
  redirect("/");
}
