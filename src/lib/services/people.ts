import "server-only";

import { db } from "@/lib/db";
import { dayKey, DayKey, fromKey, todayKey } from "@/lib/date";
import { hashPassword } from "@/lib/auth";
import { audit, notify } from "./activity";
import { getPolicy } from "./context";
import { runAccrual } from "./accrual";
import { accruedToDate, leaveYearOf, roundHalf, toEligibility } from "@/lib/policy/leave-year";
import { BALANCE_TYPES, LEAVE_META, participatesInLeave, ROLES } from "@/lib/policy/types";
import type { LeaveType, Role } from "@/lib/policy/types";

export type PersonInput = {
  name: string;
  email: string;
  empCode?: string;
  designation: string;
  role: Role;
  gender: string;
  employmentType: string;
  status: string;
  joinDate: DayKey;
  confirmDate?: DayKey | null;
  departmentId?: string | null;
  managerId?: string | null;
  phone?: string;
  location?: string;
};

export type PersonResult =
  | { ok: true; userId: string; tempPassword?: string }
  | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Readable temporary password — unambiguous characters only, so it survives being read aloud. */
export function generateTempPassword(): string {
  const words = ["prism", "studio", "cobalt", "violet", "harbor", "ember", "quartz", "cedar", "lumen", "onyx"];
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  const word = words[bytes[0] % words.length];
  const num = 100 + (((bytes[1] << 8) | bytes[2]) % 900);
  return `${word}-${num}`;
}

function nextHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

/** Employee codes run PRX001, PRX002 … derived from the highest existing number. */
export async function nextEmpCode(prefix = "PRX"): Promise<string> {
  const rows = await db.user.findMany({ select: { empCode: true } });
  let max = 0;
  for (const r of rows) {
    const m = r.empCode.match(/(\d+)\s*$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

/**
 * Who may assign which role. Only an administrator can mint administrators or HR — otherwise an
 * HR user could quietly promote themselves and nobody would be above them.
 */
export function canAssignRole(actorRole: string, targetRole: string): boolean {
  // Only a founder can create another founder. An administrator must never be able to promote
  // themselves — or anyone else — into the tier that sits above them.
  if (targetRole === "FOUNDER") return actorRole === "FOUNDER";
  if (actorRole === "FOUNDER" || actorRole === "ADMIN") return true;
  if (actorRole === "HR") return ["EMPLOYEE", "MANAGER", "HOD"].includes(targetRole);
  return false;
}

async function validate(
  input: PersonInput,
  actorRole: string,
  existingId?: string,
): Promise<string | null> {
  if (input.name.trim().length < 2) return "Enter the employee's full name.";
  if (!EMAIL_RE.test(input.email.trim())) return "That doesn't look like a valid email address.";
  if (!ROLES.includes(input.role)) return "Pick a valid role.";
  if (!canAssignRole(actorRole, input.role)) {
    return input.role === "ADMIN" || input.role === "HR"
      ? "Only an administrator can grant the Administrator or HR role."
      : "You can't assign that role.";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.joinDate)) return "Pick a joining date.";
  if (input.confirmDate && input.confirmDate < input.joinDate) {
    return "The confirmation date can't be before the joining date.";
  }
  if (input.status === "CONFIRMED" && !input.confirmDate) {
    return "A confirmed employee needs a confirmation date — it's what opens Privileged Leave (§6).";
  }

  const emailClash = await db.user.findFirst({
    where: { email: input.email.trim().toLowerCase(), ...(existingId ? { id: { not: existingId } } : {}) },
    select: { name: true },
  });
  if (emailClash) return `${emailClash.name} already uses that email address.`;

  if (input.empCode) {
    const codeClash = await db.user.findFirst({
      where: { empCode: input.empCode.trim(), ...(existingId ? { id: { not: existingId } } : {}) },
      select: { name: true },
    });
    if (codeClash) return `Employee code ${input.empCode} already belongs to ${codeClash.name}.`;
  }

  if (input.managerId && existingId && input.managerId === existingId) {
    return "Someone can't be their own reporting manager.";
  }
  if (input.managerId && existingId) {
    // Walk up the chain — a cycle would make the approval router loop forever.
    let cursor: string | null = input.managerId;
    for (let i = 0; i < 30 && cursor; i++) {
      if (cursor === existingId) {
        return "That would create a reporting loop — this person is already above the manager you picked.";
      }
      const next: { managerId: string | null } | null = await db.user.findUnique({
        where: { id: cursor },
        select: { managerId: true },
      });
      cursor = next?.managerId ?? null;
    }
  }
  return null;
}

export async function createEmployee(
  input: PersonInput,
  actor: { id: string; role: string },
  opts: { openingBalances?: Partial<Record<LeaveType, number>>; silent?: boolean } = {},
): Promise<PersonResult> {
  const problem = await validate(input, actor.role);
  if (problem) return { ok: false, error: problem };

  const email = input.email.trim().toLowerCase();
  const empCode = input.empCode?.trim() || (await nextEmpCode());
  const tempPassword = generateTempPassword();

  const user = await db.user.create({
    data: {
      empCode,
      name: input.name.trim(),
      email,
      passwordHash: await hashPassword(tempPassword),
      mustChangePassword: true,
      role: input.role,
      designation: input.designation.trim(),
      gender: input.gender,
      employmentType: input.employmentType,
      status: input.status,
      joinDate: fromKey(input.joinDate),
      confirmDate: input.confirmDate ? fromKey(input.confirmDate) : null,
      departmentId: input.departmentId || null,
      managerId: input.managerId || null,
      phone: input.phone?.trim() ?? "",
      location: input.location?.trim() || "Mumbai",
      avatarHue: nextHue(email),
    },
  });

  // Founders sit outside the policy, so no entitlement is created for them at all.
  if (participatesInLeave(user.role)) {
    // Accrual first, then the migration reconciliation — postOpeningBalances writes the difference
    // between the figure you entered and what the ledger already holds, so the accrual must be in
    // place before it runs or the balance would end up over-stated.
    await runAccrual({ userId: user.id });
    if (opts.openingBalances) {
      await postOpeningBalances(user.id, opts.openingBalances, actor.id);
    }
  }

  if (!opts.silent) {
    await audit({
      actorId: actor.id,
      action: "EMPLOYEE_CREATED",
      entity: "User",
      entityId: user.id,
      summary: `Added ${user.name} (${empCode}) as ${input.designation || input.role}`,
      meta: { email, role: input.role },
    });
  }

  return { ok: true, userId: user.id, tempPassword };
}

export async function updateEmployee(
  userId: string,
  input: PersonInput,
  actor: { id: string; role: string },
): Promise<PersonResult> {
  const before = await db.user.findUnique({ where: { id: userId } });
  if (!before) return { ok: false, error: "Employee not found." };

  const problem = await validate(input, actor.role, userId);
  if (problem) return { ok: false, error: problem };

  // Editing someone who is *already* a founder is a founder-only act, whatever you are changing
  // them into — otherwise an administrator could demote a founder and take the tier over.
  if (before.role === "FOUNDER" && actor.role !== "FOUNDER") {
    return { ok: false, error: "Only a founder can change a founder's record." };
  }
  if (before.role !== input.role && !canAssignRole(actor.role, before.role)) {
    return { ok: false, error: "Only an administrator can change that person's role." };
  }
  if (before.role === "ADMIN" && input.role !== "ADMIN") {
    const admins = await db.user.count({ where: { role: "ADMIN", isActive: true } });
    if (admins <= 1) {
      return { ok: false, error: "This is the last administrator — promote someone else first." };
    }
  }

  const email = input.email.trim().toLowerCase();
  const changes: string[] = [];
  const track = (label: string, a: unknown, b: unknown) => {
    if (String(a ?? "") !== String(b ?? "")) changes.push(`${label}: ${a || "—"} → ${b || "—"}`);
  };
  track("name", before.name, input.name.trim());
  track("email", before.email, email);
  track("role", before.role, input.role);
  track("designation", before.designation, input.designation.trim());
  track("status", before.status, input.status);
  track("department", before.departmentId, input.departmentId);
  track("manager", before.managerId, input.managerId);
  track("joining date", dayKey(before.joinDate), input.joinDate);
  track("confirmation date", before.confirmDate ? dayKey(before.confirmDate) : "", input.confirmDate ?? "");

  await db.user.update({
    where: { id: userId },
    data: {
      name: input.name.trim(),
      email,
      empCode: input.empCode?.trim() || before.empCode,
      role: input.role,
      designation: input.designation.trim(),
      gender: input.gender,
      employmentType: input.employmentType,
      status: input.status,
      joinDate: fromKey(input.joinDate),
      confirmDate: input.confirmDate ? fromKey(input.confirmDate) : null,
      departmentId: input.departmentId || null,
      managerId: input.managerId || null,
      phone: input.phone?.trim() ?? before.phone,
      location: input.location?.trim() || before.location,
    },
  });

  // Joining or confirmation dates feed the accrual schedule, so re-run it.
  if (
    dayKey(before.joinDate) !== input.joinDate ||
    (before.confirmDate ? dayKey(before.confirmDate) : null) !== (input.confirmDate ?? null)
  ) {
    await runAccrual({ userId });
  }

  if (changes.length > 0) {
    await audit({
      actorId: actor.id,
      action: "EMPLOYEE_UPDATED",
      entity: "User",
      entityId: userId,
      summary: `Updated ${input.name.trim()} — ${changes.join("; ")}`,
      meta: { changes },
    });
  }

  return { ok: true, userId };
}

/**
 * Employees are deactivated, never deleted — their leave history is part of the company's record
 * and the audit trail must stay intact.
 */
export async function setEmployeeActive(
  userId: string,
  active: boolean,
  actor: { id: string; role: string },
  reason: string,
): Promise<PersonResult> {
  if (userId === actor.id && !active) {
    return { ok: false, error: "You can't deactivate your own account." };
  }
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, error: "Employee not found." };

  if (!active) {
    if (user.role === "FOUNDER") {
      if (actor.role !== "FOUNDER") {
        return { ok: false, error: "Only a founder can deactivate a founder." };
      }
      const founders = await db.user.count({ where: { role: "FOUNDER", isActive: true } });
      if (founders <= 1) {
        return { ok: false, error: "This is the last active founder — appoint another first." };
      }
    }
    if (user.role === "ADMIN") {
      const admins = await db.user.count({ where: { role: "ADMIN", isActive: true } });
      if (admins <= 1) {
        return { ok: false, error: "This is the last active administrator — promote someone else first." };
      }
    }
    const openReports = await db.user.count({ where: { managerId: userId, isActive: true } });
    if (openReports > 0) {
      return {
        ok: false,
        error: `${openReports} ${openReports === 1 ? "person still reports" : "people still report"} to ${user.name}. Reassign them to another manager first, or their leave will have nobody to approve it.`,
      };
    }
    const pending = await db.approval.count({
      where: { approverId: userId, action: "PENDING", request: { status: { in: ["PENDING", "PENDING_HOD"] } } },
    });
    if (pending > 0) {
      return {
        ok: false,
        error: `${pending} leave ${pending === 1 ? "request is" : "requests are"} waiting on ${user.name}. Clear or reassign them first.`,
      };
    }
  }

  await db.user.update({
    where: { id: userId },
    data: {
      isActive: active,
      deactivatedAt: active ? null : new Date(),
      ...(active ? {} : { status: user.status === "RESIGNED" ? "EXITED" : user.status }),
    },
  });
  if (!active) await db.session.deleteMany({ where: { userId } });

  await audit({
    actorId: actor.id,
    action: active ? "EMPLOYEE_REACTIVATED" : "EMPLOYEE_DEACTIVATED",
    entity: "User",
    entityId: userId,
    summary: `${active ? "Reactivated" : "Deactivated"} ${user.name} — ${reason}`,
  });

  return { ok: true, userId };
}

/** Issue a temporary password. The employee is forced to change it at next sign-in. */
export async function resetPassword(
  userId: string,
  actor: { id: string; role: string },
): Promise<{ ok: true; tempPassword: string } | { ok: false; error: string }> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { name: true, role: true } });
  if (!user) return { ok: false, error: "Employee not found." };
  if (user.role === "ADMIN" && actor.role !== "ADMIN") {
    return { ok: false, error: "Only an administrator can reset an administrator's password." };
  }

  const tempPassword = generateTempPassword();
  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(tempPassword), mustChangePassword: true },
  });
  await db.session.deleteMany({ where: { userId } });

  await audit({
    actorId: actor.id,
    action: "PASSWORD_RESET",
    entity: "User",
    entityId: userId,
    summary: `Issued a temporary password for ${user.name}; all their sessions were signed out`,
  });

  return { ok: true, tempPassword };
}

/**
 * Migration — make an employee's balance match the figure your existing records show *today*.
 *
 * The number entered is what the balance must read once this returns, which is the only version
 * anyone can actually check against a spreadsheet. Because §7 accrual for the elapsed quarters is
 * posted independently, this writes the *difference* rather than the raw figure — otherwise
 * entering today's balance would sit on top of year-to-date accrual and double-count it.
 *
 * The difference can be negative (someone who has already taken more than they have accrued so
 * far). That is correct and stays visible in the ledger rather than being silently clamped.
 */
export async function postOpeningBalances(
  userId: string,
  balances: Partial<Record<LeaveType, number>>,
  actorId: string,
  asOf: DayKey = todayKey(),
): Promise<number> {
  const cfg = await getPolicy();
  const ly = leaveYearOf(asOf, cfg);

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { joinDate: true, confirmDate: true, lastWorkingDay: true, status: true },
  });
  if (!user) return 0;
  const emp = toEligibility(user);

  let posted = 0;

  for (const type of BALANCE_TYPES) {
    const target = balances[type];
    if (target === undefined || target === null || !Number.isFinite(target)) continue;

    const already = await db.leaveLedger.findFirst({
      where: { userId, leaveYear: ly.label, leaveType: type, entryKind: "OPENING" },
    });
    if (already) continue;

    // Everything the ledger already holds for this type this year — accrual, comp-off credits,
    // anything posted before migration.
    const existing = await db.leaveLedger.findMany({
      where: { userId, leaveYear: ly.label, leaveType: type },
      select: { amount: true },
    });
    const current = roundHalf(existing.reduce((sum, e) => sum + e.amount, 0));

    // Comp-off is credit-by-credit and dated (§11), so a bare opening figure can't model it.
    const accrued = type === "COMP_OFF" ? current : accruedToDate(type, emp, ly, cfg, asOf);
    const amount = roundHalf(target - current);
    if (amount === 0) continue;

    await db.leaveLedger.create({
      data: {
        userId,
        leaveYear: ly.label,
        leaveType: type,
        entryKind: "OPENING",
        amount,
        effectiveDate: fromKey(ly.start),
        actorId,
        ruleId: "MIGRATION.OPENING",
        note:
          `Carried into LeaveBase on ${asOf}: balance set to ${target} to match previous records` +
          (accrued !== 0 ? ` (${accrued} of that is ${ly.label} accrual already posted)` : ""),
      },
    });
    posted++;
  }
  return posted;
}

// ── departments ───────────────────────────────────────────────────────────────

export async function createDepartment(
  name: string,
  code: string,
  actorId: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const n = name.trim();
  const c = code.trim().toUpperCase();
  if (n.length < 2) return { ok: false, error: "Give the department a name." };
  if (!/^[A-Z0-9]{2,6}$/.test(c)) return { ok: false, error: "Use a short code of 2–6 letters or digits." };

  const clash = await db.department.findFirst({ where: { OR: [{ name: n }, { code: c }] } });
  if (clash) return { ok: false, error: `${clash.name} (${clash.code}) already exists.` };

  const dept = await db.department.create({ data: { name: n, code: c } });
  await audit({
    actorId, action: "DEPARTMENT_CREATED", entity: "Department", entityId: dept.id,
    summary: `Created department ${n} (${c})`,
  });
  return { ok: true, id: dept.id };
}

export async function setDepartmentHod(
  departmentId: string,
  hodId: string | null,
  actorId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const dept = await db.department.findUnique({ where: { id: departmentId } });
  if (!dept) return { ok: false, error: "Department not found." };

  if (hodId) {
    const hod = await db.user.findUnique({ where: { id: hodId }, select: { name: true, role: true } });
    if (!hod) return { ok: false, error: "That person isn't on record." };
    // The HOD is a second-level approver under §6, so the role has to match the responsibility.
    if (!["HOD", "HR", "ADMIN"].includes(hod.role)) {
      await db.user.update({ where: { id: hodId }, data: { role: "HOD" } });
    }
  }

  await db.department.update({ where: { id: departmentId }, data: { hodId } });
  await audit({
    actorId, action: "DEPARTMENT_HOD_SET", entity: "Department", entityId: departmentId,
    summary: hodId
      ? `Set the head of ${dept.name}`
      : `Cleared the head of ${dept.name}`,
  });
  return { ok: true };
}

export async function deleteDepartment(
  departmentId: string,
  actorId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const dept = await db.department.findUnique({
    where: { id: departmentId },
    include: { _count: { select: { members: true } } },
  });
  if (!dept) return { ok: false, error: "Department not found." };
  if (dept._count.members > 0) {
    return {
      ok: false,
      error: `${dept._count.members} ${dept._count.members === 1 ? "person is" : "people are"} still in ${dept.name}. Move them first.`,
    };
  }
  await db.department.delete({ where: { id: departmentId } });
  await audit({
    actorId, action: "DEPARTMENT_DELETED", entity: "Department", entityId: departmentId,
    summary: `Deleted department ${dept.name}`,
  });
  return { ok: true };
}

export { LEAVE_META };
