import "server-only";

import { db } from "@/lib/db";
import { DayKey, todayKey } from "@/lib/date";
import { getPolicy } from "@/lib/services/context";
import { availableAsOf } from "@/lib/policy/balance";
import { leaveYearOf, toEligibility } from "@/lib/policy/leave-year";
import { sendEmail } from "./send";

export type Recipient = { userId: string; name: string; email: string };
type BalanceLine = { type: string; before: number; after?: number };

/** Every leave type shown in the emails' balance table, in display order. */
const POOLED = ["CL", "SL", "PL", "COMP_OFF"] as const;

/**
 * Balance for each pooled leave type as it stood on `asOf` — the same point-in-time logic used
 * for "record leave already taken" (see availableAsOf), so a backdated Sick Leave application
 * shows the balance that actually decided it, not today's.
 */
export async function balanceLinesAsOf(userId: string, asOf: DayKey): Promise<BalanceLine[]> {
  const cfg = await getPolicy();
  const ly = leaveYearOf(asOf, cfg);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const emp = toEligibility(user);
  const entries = await db.leaveLedger.findMany({ where: { userId, leaveYear: ly.label } });
  return POOLED.map((t) => ({ type: t, before: availableAsOf(t, entries, emp, ly, cfg, asOf) }));
}

/** Every active Administrator and Founder. */
export async function adminAndFounderRecipients(): Promise<Recipient[]> {
  const users = await db.user.findMany({
    where: { isActive: true, role: { in: ["ADMIN", "FOUNDER"] } },
    select: { id: true, name: true, email: true },
  });
  return users.map((u) => ({ userId: u.id, name: u.name, email: u.email }));
}

/**
 * Who gets copied on an employee's leave activity: every Administrator and Founder, plus their
 * own reporting manager — deduplicated, and never including the employee themself (they get their
 * own, differently-worded email).
 */
export async function leaveNotificationRecipients(employeeUserId: string): Promise<Recipient[]> {
  const employee = await db.user.findUnique({ where: { id: employeeUserId }, select: { managerId: true } });
  const [adminsFounders, manager] = await Promise.all([
    adminAndFounderRecipients(),
    employee?.managerId
      ? db.user.findUnique({
          where: { id: employee.managerId },
          select: { id: true, name: true, email: true, isActive: true },
        })
      : Promise.resolve(null),
  ]);

  const all: Recipient[] = [...adminsFounders];
  if (manager?.isActive) all.push({ userId: manager.id, name: manager.name, email: manager.email });

  const seen = new Set<string>();
  return all.filter((r) => {
    if (r.userId === employeeUserId || seen.has(r.userId)) return false;
    seen.add(r.userId);
    return true;
  });
}

/** Same recipient set as `leaveNotificationRecipients`, under a name that reads right outside leave.ts. */
export const orgLeadershipRecipients = leaveNotificationRecipients;

/**
 * Fires every email in `templates` off in the background — never awaited by the caller, and any
 * failure is swallowed (and logged by `sendEmail` itself). The app's real work — posting the
 * ledger entry, recording the decision — must never wait on or be blocked by an email provider.
 */
export function fireEmails(templates: Array<{ to: Recipient; subject: string; html: string } | null>): void {
  for (const t of templates) {
    if (!t) continue;
    sendEmail({ to: [{ email: t.to.email, name: t.to.name }], subject: t.subject, html: t.html }).catch(() => {});
  }
}

/** The pair of emails a brand-new activation fires: a welcome to the person, a heads-up to leadership. */
export async function notifyFirstLogin(userId: string): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, designation: true, department: { select: { name: true } } },
  });
  if (!user) return;

  const { firstLoginWelcomeEmail, firstLoginTeamEmail } = await import("./templates");
  const teamRecipients = await orgLeadershipRecipients(userId);

  fireEmails([
    {
      to: { userId, name: user.name, email: user.email },
      ...firstLoginWelcomeEmail({ firstName: user.name.split(" ")[0] }),
    },
    ...teamRecipients.map((r) => ({
      to: r,
      ...firstLoginTeamEmail({
        recipientFirstName: r.name.split(" ")[0],
        employeeName: user.name,
        designation: user.designation,
        department: user.department?.name ?? "—",
        employeeId: userId,
      }),
    })),
  ]);
}

export { todayKey };
