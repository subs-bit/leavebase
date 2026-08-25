/**
 * Approval routing — who must sign off, in what order.
 *
 * A request is APPROVED only when every level has approved. Any single rejection ends the chain.
 * Derived from §6 (dual approval for long PL), §9 (HR for maternity), §11 (RM for comp-off),
 * §17 (RM + HOD for leave while serving notice) and §18.
 */

import type { LeaveType } from "./types";

export type RoutingPerson = {
  id: string;
  name: string;
  role: string;
} | null;

export type RoutingStep = {
  level: number;
  label: string;
  approverId: string | null;
  approverName: string;
  ruleId: string;
  reason: string;
};

export type RoutingInput = {
  requester: { id: string; role: string; status: string };
  manager: RoutingPerson;
  hod: RoutingPerson;
  hr: RoutingPerson;
  leaveType: LeaveType;
  /** Longest run of consecutive charged days. */
  consecutiveRun: number;
  plShortRunMax: number;
  /** Employee is serving notice and the leave falls before their last working day. */
  beforeLastWorkingDay: boolean;
};

export function buildRouting(input: RoutingInput): RoutingStep[] {
  const { requester, manager, hod, hr, leaveType, consecutiveRun, plShortRunMax } = input;
  const steps: RoutingStep[] = [];

  // ── level 1 — the immediate approver ────────────────────────────────────────
  // A HOD's own leave cannot be approved by someone who reports to them.
  let first: RoutingPerson = manager;
  let firstLabel = "Reporting Manager";
  let firstRule = "PROC.DISCRETION";
  let firstReason = "Every request is approved by the reporting manager.";

  if (!first || first.id === requester.id) {
    if (requester.role === "HOD" || requester.role === "ADMIN") {
      first = hr;
      firstLabel = "Human Resources";
      firstRule = "ROUTE.HOD_SELF";
      firstReason = "A department head's own leave is approved by HR.";
    } else {
      first = hr;
      firstLabel = "Human Resources";
      firstRule = "ROUTE.NO_MANAGER";
      firstReason = "No reporting manager on record, so HR approves.";
    }
  }

  steps.push({
    level: 1,
    label: firstLabel,
    approverId: first?.id ?? null,
    approverName: first?.name ?? "Unassigned",
    ruleId: firstRule,
    reason: firstReason,
  });

  // ── level 2 — escalations ───────────────────────────────────────────────────
  const addSecond = (person: RoutingPerson, label: string, ruleId: string, reason: string) => {
    if (!person) return;
    if (steps.some((s) => s.approverId === person.id)) return; // don't ask the same person twice
    steps.push({
      level: steps.length + 1,
      label,
      approverId: person.id,
      approverName: person.name,
      ruleId,
      reason,
    });
  };

  if (leaveType === "PL" && consecutiveRun > plShortRunMax) {
    addSecond(hod ?? hr, "Head of Department", "PL.DUAL_APPROVAL",
      `More than ${plShortRunMax} consecutive days of Privileged Leave needs the Head of Department as well (§6).`);
  }

  if (leaveType === "MATERNITY") {
    addSecond(hr, "Human Resources", "ML.NOTICE_90",
      "Maternity leave is confirmed by HR, who hold the written notice and medical certificate (§9).");
  }

  if (input.beforeLastWorkingDay) {
    addSecond(hod ?? hr, "Head of Department", "EXIT.LWD_APPROVAL",
      "Leave before the last working day needs both the reporting manager and the head of department (§17).");
  }

  return steps.map((s, i) => ({ ...s, level: i + 1 }));
}

/** The status a request should hold given its chain and how far it has progressed. */
export function statusForProgress(steps: { level: number; action: string }[]): string {
  if (steps.some((s) => s.action === "REJECTED")) return "REJECTED";
  if (steps.every((s) => s.action === "APPROVED")) return "APPROVED";
  const nextLevel = steps.filter((s) => s.action === "PENDING").sort((a, b) => a.level - b.level)[0];
  return nextLevel && nextLevel.level > 1 ? "PENDING_HOD" : "PENDING";
}

/** The step currently awaiting action. */
export function currentStep<T extends { level: number; action: string }>(steps: T[]): T | undefined {
  return steps.filter((s) => s.action === "PENDING").sort((a, b) => a.level - b.level)[0];
}
