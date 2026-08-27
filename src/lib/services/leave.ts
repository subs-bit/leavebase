import "server-only";

import { db } from "@/lib/db";
import { addDaysKey, dayKey, DayKey, fmtDate, fmtRange, fromKey, pluralDays, todayKey } from "@/lib/date";
import { evaluateRequest, Evaluation } from "@/lib/policy/evaluate";
import { leaveYearOf, roundHalf, toEligibility } from "@/lib/policy/leave-year";
import { availableAsOf } from "@/lib/policy/balance";
import { currentStep, statusForProgress } from "@/lib/policy/routing";
import { canOverrideDecisions, LEAVE_META, NON_CLUBBABLE } from "@/lib/policy/types";
import type { HalfDay, LeaveType } from "@/lib/policy/types";
import { getBalances, getCompOffAvailable, getPolicy, loadEvalBundle } from "./context";
import { audit, notify } from "./activity";

export type DraftRequest = {
  leaveType: LeaveType;
  start: DayKey;
  end: DayKey;
  halfDay: HalfDay;
  reason: string;
  contactInfo?: string;
  hasMedicalDoc?: boolean;
  medicalDocRef?: string;
  expectedDelivery?: DayKey | null;
  maternityPattern?: "SPLIT_8_18" | "POST_26" | null;
};

/** Evaluate a draft against the live database. Used by the form preview and by submission. */
export async function evaluateDraft(
  userId: string,
  draft: DraftRequest,
  opts: { excludeRequestId?: string } = {},
): Promise<Evaluation> {
  const bundle = await loadEvalBundle(userId, {
    excludeRequestId: opts.excludeRequestId,
    from: draft.start,
  });

  const conflicts = await import("./context").then((m) =>
    m.getTeamConflicts(userId, draft.start, draft.end),
  );

  return evaluateRequest({
    employee: bundle.employee,
    leaveType: draft.leaveType,
    start: draft.start,
    end: draft.end,
    halfDay: draft.halfDay,
    hasMedicalDoc: draft.hasMedicalDoc,
    expectedDelivery: draft.expectedDelivery ?? null,
    maternityPattern: draft.maternityPattern ?? null,
    cfg: bundle.cfg,
    ctx: bundle.ctx,
    balances: bundle.balances,
    existing: bundle.existing,
    compOffAvailable: bundle.compOffAvailable,
    compOffUsedThisYear: bundle.compOffUsedThisYear,
    teamConflicts: conflicts,
    manager: bundle.manager,
    hod: bundle.hod,
    hr: bundle.hr,
  });
}

async function nextCode(prefix: string): Promise<string> {
  const year = new Date().getFullYear();
  const count = await db.leaveRequest.count();
  return `${prefix}-${year}-${String(count + 1).padStart(4, "0")}`;
}

/** Submit a leave request. Re-evaluates server-side — the client preview is never trusted. */
export async function submitRequest(
  userId: string,
  draft: DraftRequest,
): Promise<{ ok: true; requestId: string } | { ok: false; error: string; evaluation: Evaluation }> {
  const evaluation = await evaluateDraft(userId, draft);

  if (!evaluation.ok) {
    const first = evaluation.findings.find((f) => f.level === "BLOCK");
    return { ok: false, error: first?.title ?? "This request doesn't meet the leave policy.", evaluation };
  }
  if (!draft.reason.trim()) {
    return { ok: false, error: "A reason is required.", evaluation };
  }

  const code = await nextCode("LV");
  const meta = LEAVE_META[draft.leaveType];

  const request = await db.$transaction(async (tx) => {
    const created = await tx.leaveRequest.create({
      data: {
        code,
        userId,
        leaveType: draft.leaveType,
        startDate: fromKey(draft.start),
        endDate: fromKey(draft.end),
        halfDay: draft.halfDay,
        chargedDays: evaluation.chargedDays,
        calendarDays: evaluation.breakdown.calendarDays,
        reason: draft.reason.trim(),
        contactInfo: draft.contactInfo ?? "",
        status: evaluation.routing.length > 1 ? "PENDING" : "PENDING",
        noticeDays: evaluation.noticeDays,
        hasMedicalDoc: draft.hasMedicalDoc ?? false,
        medicalDocRef: draft.medicalDocRef ?? "",
        expectedDelivery: draft.expectedDelivery ? fromKey(draft.expectedDelivery) : null,
        maternityPattern: draft.maternityPattern ?? null,
        isLop: evaluation.lopDays > 0,
        lopDays: evaluation.lopDays,
        policySnapshot: JSON.stringify({
          findings: evaluation.findings,
          chargedDays: evaluation.chargedDays,
          lopDays: evaluation.lopDays,
          availableBefore: evaluation.availableBefore,
          consecutiveRun: evaluation.breakdown.consecutiveRun,
          convertsToPl: evaluation.convertsToPl,
        }),
        days: {
          create: evaluation.breakdown.lines.map((l) => ({
            date: fromKey(l.date),
            dayType: l.dayType,
            charged: l.charged,
            reason: l.reason,
            label: l.label,
          })),
        },
        approvals: {
          create: evaluation.routing.map((r) => ({
            approverId: r.approverId!,
            level: r.level,
            levelLabel: r.label,
            action: "PENDING",
          })),
        },
      },
    });
    return created;
  });

  await audit({
    actorId: userId,
    action: "REQUEST_SUBMITTED",
    entity: "LeaveRequest",
    entityId: request.id,
    summary: `Applied for ${pluralDays(evaluation.chargedDays)} of ${meta.name} (${fmtRange(draft.start, draft.end)})`,
    meta: { code, leaveType: draft.leaveType, chargedDays: evaluation.chargedDays },
  });

  const firstStep = evaluation.routing[0];
  if (firstStep?.approverId) {
    const applicant = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
    await notify({
      userId: firstStep.approverId,
      kind: "REQUEST_SUBMITTED",
      title: `${applicant?.name ?? "An employee"} requested ${meta.name}`,
      body: `${fmtRange(draft.start, draft.end)} · ${pluralDays(evaluation.chargedDays)}`,
      link: `/requests/${request.id}`,
    });
  }

  return { ok: true, requestId: request.id };
}

/** Approve or reject at the current level. Advances or terminates the chain. */
export async function decideRequest(
  requestId: string,
  approverId: string,
  action: "APPROVED" | "REJECTED",
  comment: string,
): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  const request = await db.leaveRequest.findUnique({
    where: { id: requestId },
    include: { approvals: { orderBy: { level: "asc" } }, user: { select: { name: true, id: true } } },
  });
  if (!request) return { ok: false, error: "Request not found." };
  if (!["PENDING", "PENDING_HOD"].includes(request.status)) {
    return { ok: false, error: `This request is already ${request.status.toLowerCase()}.` };
  }

  const step = currentStep(request.approvals);
  if (!step) return { ok: false, error: "There is no pending approval step." };

  const approver = await db.user.findUnique({ where: { id: approverId }, select: { role: true, name: true } });
  const isOverride = canOverrideDecisions(approver?.role ?? "");
  if (step.approverId !== approverId && !isOverride) {
    return { ok: false, error: "This request is not awaiting your approval." };
  }
  if (action === "REJECTED" && !comment.trim()) {
    return { ok: false, error: "A reason is required when rejecting." };
  }

  const updatedSteps = request.approvals.map((a) =>
    a.id === step.id ? { ...a, action } : a,
  );
  const newStatus = statusForProgress(updatedSteps);

  await db.$transaction(async (tx) => {
    await tx.approval.update({
      where: { id: step.id },
      data: {
        action,
        comment: comment.trim(),
        actedAt: new Date(),
        ...(step.approverId !== approverId ? { approverId } : {}),
      },
    });

    if (action === "REJECTED") {
      await tx.approval.updateMany({
        where: { requestId, action: "PENDING" },
        data: { action: "SKIPPED" },
      });
    }

    await tx.leaveRequest.update({
      where: { id: requestId },
      data: {
        status: newStatus,
        ...(newStatus === "APPROVED" || newStatus === "REJECTED" ? { decidedAt: new Date() } : {}),
      },
    });
  });

  if (newStatus === "APPROVED") {
    await postAvailLedger(requestId);
  }

  await audit({
    actorId: approverId,
    action: action === "APPROVED" ? "REQUEST_APPROVED" : "REQUEST_REJECTED",
    entity: "LeaveRequest",
    entityId: requestId,
    summary: `${action === "APPROVED" ? "Approved" : "Rejected"} ${request.code} — ${request.user.name}, ${LEAVE_META[request.leaveType as LeaveType].name}${comment.trim() ? ` — "${comment.trim()}"` : ""}`,
    meta: { level: step.level, levelLabel: step.levelLabel, newStatus },
  });

  const meta = LEAVE_META[request.leaveType as LeaveType];
  if (newStatus === "APPROVED" || newStatus === "REJECTED") {
    await notify({
      userId: request.userId,
      kind: newStatus === "APPROVED" ? "APPROVED" : "REJECTED",
      title: `${meta.name} ${newStatus === "APPROVED" ? "approved" : "rejected"}`,
      body: `${fmtRange(dayKey(request.startDate), dayKey(request.endDate))}${comment.trim() ? ` — "${comment.trim()}"` : ""}`,
      link: `/requests/${requestId}`,
    });
  } else {
    const next = currentStep(updatedSteps);
    if (next?.approverId) {
      await notify({
        userId: next.approverId,
        kind: "REQUEST_SUBMITTED",
        title: `${request.user.name}'s ${meta.name} needs your approval`,
        body: `Approved by ${approver?.name ?? "the reporting manager"} — now with you as ${next.levelLabel}.`,
        link: `/requests/${requestId}`,
      });
    }
  }

  return { ok: true, status: newStatus };
}

/**
 * Post the balance debit for an approved request.
 *
 * Two policy subtleties land here:
 *  §5 SL.DOC_FAILURE — sick leave beyond the medical-proof threshold with no documents is charged
 *                      to Privileged Leave instead of Sick Leave.
 *  §13 LOP.NO_BALANCE — any shortfall against the balance is unpaid rather than blocked.
 */
async function postAvailLedger(requestId: string): Promise<void> {
  const request = await db.leaveRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: { user: { select: { id: true, name: true } } },
  });
  if (request.leaveType === "LOP") return;

  const cfg = await (await import("./context")).getPolicy();
  const start = dayKey(request.startDate);
  const ly = leaveYearOf(start, cfg);
  const snapshot = safeJson(request.policySnapshot);

  // Comp-off consumes dated credits rather than a pooled number (§11).
  if (request.leaveType === "COMP_OFF") {
    const credits = await db.compOffCredit.findMany({
      where: { userId: request.userId, status: "APPROVED" },
      orderBy: { expiresAt: "asc" },
    });
    const need = Math.ceil(request.chargedDays);
    const toConsume = credits.slice(0, need);
    await db.$transaction(async (tx) => {
      for (const c of toConsume) {
        await tx.compOffCredit.update({
          where: { id: c.id },
          data: { status: "CONSUMED", consumedById: requestId },
        });
      }
      await tx.leaveLedger.create({
        data: {
          userId: request.userId, leaveYear: ly.label, leaveType: "COMP_OFF",
          entryKind: "AVAIL", amount: -request.chargedDays,
          effectiveDate: request.startDate, requestId,
          ruleId: "CO.AVAIL_APPROVAL",
          note: `Compensatory off — ${fmtRange(start, dayKey(request.endDate))}`,
        },
      });
    });
    return;
  }

  // §5 — sick leave without medical documents is charged to PL.
  let chargeType: string = request.leaveType;
  let conversionNote = "";
  if (request.leaveType === "SL" && snapshot.convertsToPl && !request.hasMedicalDoc) {
    chargeType = "PL";
    conversionNote = " — charged to Privileged Leave, medical documents not provided (§5)";
  }

  const payable = roundHalf(request.chargedDays - request.lopDays);

  await db.$transaction(async (tx) => {
    if (payable > 0) {
      await tx.leaveLedger.create({
        data: {
          userId: request.userId, leaveYear: ly.label, leaveType: chargeType,
          entryKind: "AVAIL", amount: -payable,
          effectiveDate: request.startDate, requestId,
          ruleId: chargeType !== request.leaveType ? "SL.DOC_FAILURE" : "",
          note: `${LEAVE_META[request.leaveType as LeaveType].name} — ${fmtRange(start, dayKey(request.endDate))}${conversionNote}`,
        },
      });
    }
    if (request.lopDays > 0) {
      await tx.leaveRequest.update({ where: { id: requestId }, data: { isLop: true } });
    }
  });
}

/** §16 — an approver cancels sanctioned leave, or the employee withdraws their own request. */
export async function cancelRequest(
  requestId: string,
  actorId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const request = await db.leaveRequest.findUnique({
    where: { id: requestId },
    include: { user: { select: { name: true } }, approvals: true },
  });
  if (!request) return { ok: false, error: "Request not found." };
  if (["CANCELLED", "WITHDRAWN", "REJECTED"].includes(request.status)) {
    return { ok: false, error: "This request is already closed." };
  }

  const actor = await db.user.findUniqueOrThrow({
    where: { id: actorId },
    select: { role: true, name: true },
  });
  const isSelf = actorId === request.userId;
  const isApprover =
    request.approvals.some((a) => a.approverId === actorId) ||
    actor.role === "HOD" ||
    canOverrideDecisions(actor.role);

  if (!isSelf && !isApprover) return { ok: false, error: "You can't cancel this request." };

  // §16 CANC.BY_EMPLOYEE — an employee cannot self-cancel leave that has already started.
  if (isSelf && !isApprover && request.status === "APPROVED") {
    if (dayKey(request.startDate) <= todayKey()) {
      return {
        ok: false,
        error: "This leave has already started. Ask your reporting manager or HR to cancel it.",
      };
    }
  }
  if (!reason.trim()) return { ok: false, error: "A reason is required." };

  const wasApproved = request.status === "APPROVED";
  const newStatus = isSelf && !wasApproved ? "WITHDRAWN" : "CANCELLED";

  await db.$transaction(async (tx) => {
    await tx.leaveRequest.update({
      where: { id: requestId },
      data: { status: newStatus, cancelReason: reason.trim(), decidedAt: new Date() },
    });
    await tx.approval.updateMany({
      where: { requestId, action: "PENDING" },
      data: { action: "SKIPPED" },
    });
  });

  // §16 CANC.CREDIT_BACK — reverse the debit.
  if (wasApproved) {
    const debits = await db.leaveLedger.findMany({
      where: { requestId, entryKind: "AVAIL" },
    });
    for (const d of debits) {
      await db.leaveLedger.create({
        data: {
          userId: d.userId, leaveYear: d.leaveYear, leaveType: d.leaveType,
          entryKind: "CANCEL_CREDIT", amount: Math.abs(d.amount),
          effectiveDate: new Date(), requestId, actorId,
          ruleId: "CANC.CREDIT_BACK",
          note: `Cancelled — ${reason.trim()}`,
        },
      });
    }
    await db.compOffCredit.updateMany({
      where: { consumedById: requestId },
      data: { status: "APPROVED", consumedById: null },
    });
  }

  await audit({
    actorId,
    action: newStatus === "WITHDRAWN" ? "REQUEST_WITHDRAWN" : "REQUEST_CANCELLED",
    entity: "LeaveRequest",
    entityId: requestId,
    summary: `${newStatus === "WITHDRAWN" ? "Withdrew" : "Cancelled"} ${request.code} — ${reason.trim()}`,
    meta: { wasApproved },
  });

  if (!isSelf) {
    await notify({
      userId: request.userId,
      kind: "CANCELLED",
      title: `Your ${LEAVE_META[request.leaveType as LeaveType].name} was cancelled`,
      body: `${fmtRange(dayKey(request.startDate), dayKey(request.endDate))} — ${reason.trim()}. If you proceed to take this leave it will be treated as unauthorised (§16).`,
      link: `/requests/${requestId}`,
    });
  }

  return { ok: true };
}

/**
 * Administrative correction — reclassify an approved request from one pooled leave type to
 * another (Casual, Sick or Privileged only; comp-off is dated credits rather than a pool, and
 * maternity/paternity/LOP have their own eligibility and day-count rules, so none of them are
 * safe to swap this way). For a request marked as one type by mistake — or one that was originally
 * charged elsewhere under §5's sick-leave doc-failure rule and should be put right.
 *
 * Reverses exactly what's currently charged (whichever type that actually is — it may already
 * differ from `request.leaveType`) with a CONVERSION entry, then charges the new type from
 * scratch against its *own* balance. §13 still applies: if the new type doesn't have enough
 * balance, the shortfall becomes Loss of Pay rather than blocking the change, the same as any
 * other request.
 */
export async function reassignLeaveType(
  requestId: string,
  newType: LeaveType,
  actorId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const request = await db.leaveRequest.findUnique({
    where: { id: requestId },
    include: { user: { select: { name: true } } },
  });
  if (!request) return { ok: false, error: "Request not found." };
  if (request.status !== "APPROVED") {
    return { ok: false, error: "Only approved leave can be reassigned to a different type." };
  }
  const oldType = request.leaveType as LeaveType;
  if (!NON_CLUBBABLE.includes(newType) || !NON_CLUBBABLE.includes(oldType)) {
    return { ok: false, error: "Only Casual, Sick and Privileged Leave can be reassigned this way." };
  }
  if (newType === oldType) return { ok: false, error: "That's already its type." };
  if (!reason.trim()) return { ok: false, error: "A reason is required." };

  const cfg = await getPolicy();
  const start = dayKey(request.startDate);
  const end = dayKey(request.endDate);
  const ly = leaveYearOf(start, cfg);

  const currentDebits = await db.leaveLedger.findMany({ where: { requestId, entryKind: "AVAIL" } });

  // §13 — recompute against the new type's own balance; a shortfall becomes LOP, same as any request.
  const balances = await getBalances(request.userId, cfg, ly);
  const available = balances.find((b) => b.leaveType === newType)?.available ?? 0;
  const lopDays = Math.max(0, roundHalf(request.chargedDays - available));
  const payable = roundHalf(request.chargedDays - lopDays);

  await db.$transaction(async (tx) => {
    for (const d of currentDebits) {
      await tx.leaveLedger.create({
        data: {
          userId: request.userId, leaveYear: d.leaveYear, leaveType: d.leaveType,
          entryKind: "CONVERSION", amount: Math.abs(d.amount),
          effectiveDate: new Date(), requestId, actorId,
          ruleId: "REASSIGN.OUT",
          note: `Reassigned to ${LEAVE_META[newType].name} — ${reason.trim()}`,
        },
      });
    }
    if (payable > 0) {
      await tx.leaveLedger.create({
        data: {
          userId: request.userId, leaveYear: ly.label, leaveType: newType,
          entryKind: "CONVERSION", amount: -payable,
          effectiveDate: request.startDate, requestId, actorId,
          ruleId: "REASSIGN.IN",
          note: `Reassigned from ${LEAVE_META[oldType].name} — ${fmtRange(start, end)}`,
        },
      });
    }
    await tx.leaveRequest.update({
      where: { id: requestId },
      data: { leaveType: newType, lopDays, isLop: lopDays > 0 },
    });
  });

  await audit({
    actorId,
    action: "REQUEST_REASSIGNED",
    entity: "LeaveRequest",
    entityId: requestId,
    summary:
      `Reassigned ${request.code} for ${request.user.name} from ${LEAVE_META[oldType].name} to ` +
      `${LEAVE_META[newType].name}${lopDays > 0 ? ` — ${pluralDays(lopDays)} now unpaid under §13` : ""} — ${reason.trim()}`,
    meta: { oldType, newType, lopDays },
  });

  await notify({
    userId: request.userId,
    kind: "APPROVED",
    title: `Your ${LEAVE_META[oldType].name} was changed to ${LEAVE_META[newType].name}`,
    body:
      `${fmtRange(start, end)} — ${reason.trim()}.` +
      (lopDays > 0 ? ` ${pluralDays(lopDays)} is now unpaid under §13.` : ""),
    link: `/requests/${requestId}`,
  });

  return { ok: true };
}

/**
 * Administrator/Founder last resort — erase a request completely, as though it never existed:
 * every ledger entry it ever posted (its original debit, and any cancel-credit or reassignment
 * on top of it), its approval trail, and the request itself. Unlike `cancelRequest`, which keeps
 * a full paper trail by design (§16), this leaves none — for the case a request was recorded
 * wrongly enough that cancelling it doesn't put things right, and it needs to disappear outright.
 * There is no undo; the audit log entry this writes is the only trace that remains.
 */
export async function deleteRequestPermanently(
  requestId: string,
  actorId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const request = await db.leaveRequest.findUnique({
    where: { id: requestId },
    include: { user: { select: { name: true } } },
  });
  if (!request) return { ok: false, error: "Request not found." };
  if (!reason.trim()) return { ok: false, error: "A reason is required." };

  const start = dayKey(request.startDate);
  const end = dayKey(request.endDate);
  const meta = LEAVE_META[request.leaveType as LeaveType];

  // LeaveRequestDay and Approval cascade-delete with the request. LeaveLedger and CompOffCredit
  // only have their link to it *cleared* on delete (so history survives a normal deletion
  // elsewhere) — for a permanent erasure that must not leave the balance or credits affected, both
  // need explicit cleanup first.
  await db.$transaction(async (tx) => {
    await tx.compOffCredit.updateMany({
      where: { consumedById: requestId },
      data: { status: "APPROVED", consumedById: null },
    });
    await tx.leaveLedger.deleteMany({ where: { requestId } });
    await tx.leaveRequest.delete({ where: { id: requestId } });
  });

  await audit({
    actorId,
    action: "REQUEST_DELETED",
    entity: "LeaveRequest",
    entityId: requestId,
    summary:
      `Permanently deleted ${request.code} for ${request.user.name} — ${meta?.name ?? request.leaveType}, ` +
      `${pluralDays(request.chargedDays)}, ${fmtRange(start, end)}, was ${request.status} — ${reason.trim()}`,
    meta: { code: request.code, leaveType: request.leaveType, chargedDays: request.chargedDays, wasStatus: request.status },
  });

  await notify({
    userId: request.userId,
    kind: "CANCELLED",
    title: `A ${meta?.name ?? "leave"} record was deleted`,
    body: `${fmtRange(start, end)} — ${reason.trim()}. Speak to HR if this is unexpected.`,
    link: "/requests",
  });

  return { ok: true };
}

// ── comp-off (§11) ────────────────────────────────────────────────────────────

export async function claimCompOff(
  userId: string,
  workedDate: DayKey,
  reason: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const cfg = await (await import("./context")).getPolicy();
  const { getCalendarContext } = await import("./context");
  const ctx = await getCalendarContext(userId, cfg);
  const { classifyDay } = await import("@/lib/policy/calendar");

  const { type, label } = classifyDay(workedDate, ctx);
  if (type === "WORKING") {
    return {
      ok: false,
      error: `${fmtDate(workedDate)} is a normal working day. Comp-off is earned only by working a declared holiday or a weekly off (§11).`,
    };
  }
  if (workedDate > todayKey()) {
    return { ok: false, error: "You can only claim a comp-off for a day you've already worked." };
  }
  if (!reason.trim()) return { ok: false, error: "Describe what you worked on." };

  const existing = await db.compOffCredit.findFirst({
    where: { userId, workedDate: fromKey(workedDate), status: { in: ["PENDING", "APPROVED", "CONSUMED"] } },
  });
  if (existing) return { ok: false, error: `You've already claimed a comp-off for ${fmtDate(workedDate)}.` };

  const ly = leaveYearOf(workedDate, cfg);
  const expiresAt = addDaysKey(workedDate, cfg.compOffExpiryDays);

  const credit = await db.compOffCredit.create({
    data: {
      userId,
      workedDate: fromKey(workedDate),
      workedDayType: type,
      reason: reason.trim(),
      status: "PENDING",
      expiresAt: fromKey(expiresAt),
      leaveYear: ly.label,
    },
  });

  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { name: true, managerId: true },
  });
  if (user.managerId) {
    await notify({
      userId: user.managerId,
      kind: "REQUEST_SUBMITTED",
      title: `${user.name} claimed a comp-off`,
      body: `Worked ${label} on ${fmtDate(workedDate)} — expires ${fmtDate(expiresAt)} if not used.`,
      link: "/comp-off",
    });
  }

  await audit({
    actorId: userId, action: "COMPOFF_CLAIMED", entity: "CompOffCredit", entityId: credit.id,
    summary: `Claimed comp-off for ${fmtDate(workedDate)} (${label})`,
  });

  return { ok: true, id: credit.id };
}

export async function decideCompOff(
  creditId: string,
  approverId: string,
  action: "APPROVED" | "REJECTED",
  comment: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const credit = await db.compOffCredit.findUnique({
    where: { id: creditId },
    include: { user: { select: { name: true, managerId: true } } },
  });
  if (!credit) return { ok: false, error: "Claim not found." };
  if (credit.status !== "PENDING") return { ok: false, error: "This claim has already been decided." };

  const approver = await db.user.findUniqueOrThrow({
    where: { id: approverId }, select: { role: true, name: true },
  });
  const allowed =
    credit.user.managerId === approverId || ["HR", "ADMIN", "HOD"].includes(approver.role);
  if (!allowed) return { ok: false, error: "This claim is not yours to approve." };

  await db.compOffCredit.update({
    where: { id: creditId },
    data: {
      status: action,
      approvedById: approverId,
      approvedAt: new Date(),
      rejectComment: action === "REJECTED" ? comment.trim() : "",
    },
  });

  if (action === "APPROVED") {
    const cfg = await (await import("./context")).getPolicy();
    const ly = leaveYearOf(dayKey(credit.workedDate), cfg);
    await db.leaveLedger.create({
      data: {
        userId: credit.userId, leaveYear: ly.label, leaveType: "COMP_OFF",
        entryKind: "COMP_CREDIT", amount: 1,
        effectiveDate: credit.workedDate, actorId: approverId,
        ruleId: "CO.CLAIM_FIRST",
        note: `Worked ${fmtDate(dayKey(credit.workedDate))} — expires ${fmtDate(dayKey(credit.expiresAt))}`,
      },
    });
  }

  await notify({
    userId: credit.userId,
    kind: action === "APPROVED" ? "APPROVED" : "REJECTED",
    title: `Comp-off claim ${action === "APPROVED" ? "approved" : "rejected"}`,
    body: action === "APPROVED"
      ? `Credited for ${fmtDate(dayKey(credit.workedDate))}. Use it by ${fmtDate(dayKey(credit.expiresAt))} or it lapses (§11).`
      : comment.trim() || "No reason given.",
    link: "/comp-off",
  });

  await audit({
    actorId: approverId, action: `COMPOFF_${action}`, entity: "CompOffCredit", entityId: creditId,
    summary: `${action === "APPROVED" ? "Approved" : "Rejected"} ${credit.user.name}'s comp-off for ${fmtDate(dayKey(credit.workedDate))}`,
  });

  return { ok: true };
}

/** §11 CO.EXPIRY_20 — lapse credits past their 20-day window. Idempotent; safe to run often. */
export async function expireCompOffs(asOf: DayKey = todayKey()): Promise<number> {
  const stale = await db.compOffCredit.findMany({
    where: { status: "APPROVED", expiresAt: { lt: fromKey(asOf) } },
  });
  for (const c of stale) {
    await db.$transaction(async (tx) => {
      await tx.compOffCredit.update({ where: { id: c.id }, data: { status: "EXPIRED" } });
      await tx.leaveLedger.create({
        data: {
          userId: c.userId, leaveYear: c.leaveYear, leaveType: "COMP_OFF",
          entryKind: "LAPSE", amount: -1,
          effectiveDate: c.expiresAt, ruleId: "CO.EXPIRY_20",
          note: `Comp-off for ${fmtDate(dayKey(c.workedDate))} lapsed — not availed within 20 days`,
        },
      });
    });
    await notify({
      userId: c.userId, kind: "BALANCE_LAPSE",
      title: "A comp-off lapsed",
      body: `Your comp-off for ${fmtDate(dayKey(c.workedDate))} expired without being used (§11).`,
      link: "/comp-off",
    });
  }
  return stale.length;
}

function safeJson(s: string): Record<string, unknown> {
  try { return JSON.parse(s) as Record<string, unknown>; } catch { return {}; }
}

export { getCompOffAvailable };

/**
 * HR records leave an employee has already taken — history from before LeaveBase, or a day
 * somebody forgot to file.
 *
 * The advance-notice rules (§15, and §6's 15/30-day requirements) deliberately do not apply here:
 * they govern an employee *asking* for leave, not HR writing down what already happened. Everything
 * that affects the numbers still applies in full — the §8 intervening-days rule, the balance
 * deduction, and §13 Loss of Pay when the balance falls short.
 *
 * The record is created already approved, with no approval chain, and is marked in the audit log
 * as entered by HR rather than decided by a manager.
 */
export async function recordHistoricalLeave(opts: {
  userId: string;
  leaveType: LeaveType;
  start: DayKey;
  end: DayKey;
  halfDay: HalfDay;
  reason: string;
  actorId: string;
}): Promise<
  | { ok: true; requestId: string; chargedDays: number; lopDays: number }
  | { ok: false; error: string }
> {
  const { userId, leaveType, start, end, halfDay, reason, actorId } = opts;

  if (leaveType === "LOP") {
    return { ok: false, error: "Use “Record unauthorised absence” for Loss of Pay days (§12)." };
  }
  if (!reason.trim()) return { ok: false, error: "Note what this leave was for." };

  const { buildBreakdown } = await import("@/lib/policy/calendar");
  const { getCalendarContext, getPolicy: loadPolicy } = await import("./context");
  const { diffDays } = await import("@/lib/date");

  if (diffDays(start, end) < 0) return { ok: false, error: "The end date is before the start date." };

  const cfg = await loadPolicy();
  const ly = leaveYearOf(start, cfg);
  if (leaveYearOf(end, cfg).label !== ly.label) {
    return {
      ok: false,
      error: "This spans two leave years. Record it as two entries, split at 31 March (§3).",
    };
  }

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, error: "Employee not found." };
  if (user.role === "FOUNDER") {
    return { ok: false, error: `${user.name} sits outside the leave policy, so there is no balance to record against.` };
  }

  const ctx = await getCalendarContext(userId, cfg);
  const breakdown = buildBreakdown({ start, end, leaveType, halfDay, ctx });

  if (breakdown.chargedDays <= 0) {
    return {
      ok: false,
      error: "Those dates are all weekly offs or holidays, so no leave would be deducted.",
    };
  }

  const clash = await db.leaveRequestDay.findFirst({
    where: {
      charged: { gt: 0 },
      date: { gte: fromKey(start), lte: fromKey(end) },
      request: { userId, status: { in: ["PENDING", "PENDING_HOD", "APPROVED"] } },
    },
    include: { request: { select: { code: true } } },
  });
  if (clash) {
    return {
      ok: false,
      error: `${user.name} already has leave on those dates (${clash.request.code}). Cancel it first if this is a correction.`,
    };
  }

  // §13 — a shortfall against the balance becomes unpaid rather than blocking the record. Checked
  // against the balance as it stood *on the leave date itself*, not today's — today's balance
  // never retroactively pays for an earlier shortfall; whether a backdated day was covered was
  // decided on the day, permanently (see `availableAsOf`). Only meaningful for the types that draw
  // from a running balance (CL/SL/PL/comp-off) — Maternity and Paternity aren't (LEAVE_META.accrues
  // is false for both, the same guard evaluateRequest uses), so recording them never manufactures
  // a false Loss of Pay against a balance that doesn't exist.
  const entries = await db.leaveLedger.findMany({ where: { userId, leaveYear: ly.label } });
  const available = availableAsOf(leaveType, entries, toEligibility(user), ly, cfg, start);
  const lopDays = LEAVE_META[leaveType].accrues
    ? Math.max(0, roundHalf(breakdown.chargedDays - available))
    : 0;
  const payable = roundHalf(breakdown.chargedDays - lopDays);

  const count = await db.leaveRequest.count();
  const code = `HR-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
  const meta = LEAVE_META[leaveType];

  const request = await db.leaveRequest.create({
    data: {
      code,
      userId,
      leaveType,
      startDate: fromKey(start),
      endDate: fromKey(end),
      halfDay,
      chargedDays: breakdown.chargedDays,
      calendarDays: breakdown.calendarDays,
      reason: reason.trim(),
      status: "APPROVED",
      appliedAt: new Date(),
      decidedAt: new Date(),
      noticeDays: 0,
      isLop: lopDays > 0,
      lopDays,
      policySnapshot: JSON.stringify({
        recordedByHr: true,
        recordedBy: actorId,
        chargedDays: breakdown.chargedDays,
        sandwichedDays: breakdown.sandwichedDays,
        ruleId: "HR.HISTORICAL",
      }),
      days: {
        create: breakdown.lines.map((l) => ({
          date: fromKey(l.date),
          dayType: l.dayType,
          charged: l.charged,
          reason: l.reason,
          label: l.label,
        })),
      },
    },
  });

  if (payable > 0) {
    await db.leaveLedger.create({
      data: {
        userId,
        leaveYear: ly.label,
        leaveType,
        entryKind: "AVAIL",
        amount: -payable,
        effectiveDate: fromKey(start),
        requestId: request.id,
        actorId,
        ruleId: "HR.HISTORICAL",
        note: `${meta.name} — ${fmtRange(start, end)} (recorded by HR, not applied for in advance)`,
      },
    });
  }

  await audit({
    actorId,
    action: "LEAVE_RECORDED",
    entity: "LeaveRequest",
    entityId: request.id,
    summary:
      `Recorded ${pluralDays(breakdown.chargedDays)} of ${meta.name} already taken by ${user.name} ` +
      `(${fmtRange(start, end)})${lopDays > 0 ? `, of which ${pluralDays(lopDays)} unpaid under §13` : ""}`,
    meta: { code, leaveType, chargedDays: breakdown.chargedDays, lopDays },
  });

  await notify({
    userId,
    kind: "APPROVED",
    title: `${meta.name} recorded on your account`,
    body:
      `${fmtRange(start, end)} · ${pluralDays(breakdown.chargedDays)} deducted. ` +
      `Entered by HR as leave already taken. Tell them if this looks wrong.`,
    link: `/requests/${request.id}`,
  });

  return { ok: true, requestId: request.id, chargedDays: breakdown.chargedDays, lopDays };
}
