import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { isAdministrator, isFounder, isHrOrAdmin } from "./policy/types";

const COOKIE = "leavebase_session";
const SESSION_DAYS = 30;

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  empCode: string;
  role: string;
  designation: string;
  gender: string;
  status: string;
  employmentType: string;
  avatarHue: number;
  departmentId: string | null;
  departmentName: string | null;
  managerId: string | null;
  joinDate: Date;
  confirmDate: Date | null;
  lastWorkingDay: Date | null;
  isActive: boolean;
  mustChangePassword: boolean;
  themePreference: string;
};

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function createSession(userId: string): Promise<void> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.session.create({ data: { userId, token, expiresAt } });
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { token } });
  jar.delete(COOKIE);
}

/** The signed-in user, or null. Never throws. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({ where: { token } });
  if (!session || session.expiresAt < new Date()) {
    if (session) await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  const u = await db.user.findUnique({
    where: { id: session.userId },
    include: { department: { select: { name: true } } },
  });
  if (!u || !u.isActive) return null;

  return {
    id: u.id,
    name: u.name,
    email: u.email,
    empCode: u.empCode,
    role: u.role,
    designation: u.designation,
    gender: u.gender,
    status: u.status,
    employmentType: u.employmentType,
    avatarHue: u.avatarHue,
    departmentId: u.departmentId,
    departmentName: u.department?.name ?? null,
    managerId: u.managerId,
    joinDate: u.joinDate,
    confirmDate: u.confirmDate,
    lastWorkingDay: u.lastWorkingDay,
    isActive: u.isActive,
    mustChangePassword: u.mustChangePassword,
    themePreference: u.themePreference,
  };
}

/** The signed-in user, or a redirect to the login page. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireHr(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isHrOrAdmin(user.role)) redirect("/");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isAdministrator(user.role)) redirect("/");
  return user;
}

/** Only a founder may reach this — used for anything that governs founders themselves. */
export async function requireFounder(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isFounder(user.role)) redirect("/");
  return user;
}

/** Can `viewer` see `targetUserId`'s record? Self, their reports, their department, or HR. */
export async function canViewUser(viewer: SessionUser, targetUserId: string): Promise<boolean> {
  if (viewer.id === targetUserId) return true;
  if (isHrOrAdmin(viewer.role)) return true;
  const target = await db.user.findUnique({
    where: { id: targetUserId },
    select: { managerId: true, departmentId: true },
  });
  if (!target) return false;
  if (target.managerId === viewer.id) return true;
  if (viewer.role === "HOD" && target.departmentId && target.departmentId === viewer.departmentId) {
    return true;
  }
  return false;
}
