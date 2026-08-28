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

export function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Weak-password guard. Deliberately short — friction here costs adoption, not security. */
export function weakPassword(password: string, name: string, email: string): string | null {
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

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Stamps `lastLoginAt` and reports whether this is the account's first-ever login (it was null
 * beforehand) — the signal the "welcome, you're activated" emails key off. Called at the moment
 * of successful authentication, wherever that happens: the ordinary password form, or a one-time
 * link that signs someone in directly.
 */
export async function recordLogin(userId: string): Promise<{ isFirstLogin: boolean }> {
  const before = await db.user.findUnique({ where: { id: userId }, select: { lastLoginAt: true } });
  await db.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  return { isFirstLogin: before?.lastLoginAt == null };
}

// ── one-time login links (account activation, admin password reset) ────────────
//
// Replaces a temporary password with a single-use, expiring link that signs someone straight to
// a "set your password" page. Only the SHA-256 hash of the token is ever stored — same principle
// as passwordHash — because the token itself carries 256 bits of entropy from crypto.getRandomValues,
// which is already computationally infeasible to brute-force; it doesn't need bcrypt's deliberate
// slowness, which exists specifically to blunt brute-forcing a *low*-entropy human-chosen secret.

export type LoginTokenPurpose = "ACTIVATE" | "RESET";

const TOKEN_TTL_HOURS: Record<LoginTokenPurpose, number> = {
  ACTIVATE: 48,
  RESET: 2,
};

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Issues a fresh link token, invalidating any earlier unused one of the same purpose for this user. */
export async function issueLoginToken(
  userId: string,
  purpose: LoginTokenPurpose,
): Promise<{ token: string; expiresAt: Date; ttlHours: number }> {
  const token = randomToken();
  const tokenHash = await hashToken(token);
  const ttlHours = TOKEN_TTL_HOURS[purpose];
  const expiresAt = new Date(Date.now() + ttlHours * 3_600_000);

  await db.$transaction([
    db.loginToken.deleteMany({ where: { userId, purpose, usedAt: null } }),
    db.loginToken.create({ data: { userId, tokenHash, purpose, expiresAt } }),
  ]);

  return { token, expiresAt, ttlHours };
}

/** Checks a token without consuming it — for rendering the set-password page before submission. */
export async function peekLoginToken(
  token: string,
  purpose: LoginTokenPurpose,
): Promise<{ ok: true; userId: string; name: string; email: string } | { ok: false; error: string }> {
  const tokenHash = await hashToken(token);
  const row = await db.loginToken.findUnique({
    where: { tokenHash },
    include: { user: { select: { name: true, email: true, isActive: true } } },
  });
  const expired = "This link has expired or already been used — ask HR to send a new one.";
  if (!row || row.purpose !== purpose) return { ok: false, error: expired };
  if (row.usedAt || row.expiresAt < new Date()) return { ok: false, error: expired };
  if (!row.user.isActive) return { ok: false, error: "This account is no longer active." };
  return { ok: true, userId: row.userId, name: row.user.name, email: row.user.email };
}

/** Consumes a token and sets the new password in one step. Safe against a concurrent double-submit. */
export async function consumeLoginToken(
  token: string,
  purpose: LoginTokenPurpose,
  newPassword: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const check = await peekLoginToken(token, purpose);
  if (!check.ok) return check;

  const tokenHash = await hashToken(token);
  const passwordHash = await hashPassword(newPassword);

  const userId = await db.$transaction(async (tx) => {
    const consumed = await tx.loginToken.updateMany({
      where: { tokenHash, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (consumed.count === 0) return null; // already used by a concurrent request
    await tx.user.update({
      where: { id: check.userId },
      data: { passwordHash, mustChangePassword: false },
    });
    return check.userId;
  });

  if (!userId) return { ok: false, error: "This link has already been used — ask HR to send a new one." };
  return { ok: true, userId };
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
