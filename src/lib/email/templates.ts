/**
 * One function per email, each returning { subject, html }. Every template is built from the
 * shared shell/components in ./shell so they stay visually consistent. These are pure functions —
 * no DB access — the caller assembles the data and passes it in, which is also what makes them
 * easy to preview with sample data before anything is wired to a real send.
 */

import {
  APP_URL, badge, balanceRow, balanceTable, calloutWarn, card, ctaButton, detailRows,
  emailShell, fmtDaysHtml, heading, lede, paragraph, LEAVE_COLOR, COLOR,
} from "./shell";

export type EmailResult = { subject: string; html: string };

type BalanceLine = { type: string; before: number; after?: number };

function balanceBlock(lines: BalanceLine[], title?: string): string {
  return balanceTable(lines.map((l) => balanceRow(l.type, l.before, l.after)).join(""), title);
}

// ── §7 leave request lifecycle ──────────────────────────────────────────────────

export function leaveSubmittedToApproverEmail(d: {
  approverFirstName: string;
  applicantName: string;
  applicantDesignation: string;
  leaveTypeCode: string;
  dateRange: string;
  days: number;
  reason: string;
  noticeDays: number;
  balanceOnDate: BalanceLine[];
  lopDays: number;
  extraApprover?: string;
  warnings?: string[];
  requestId: string;
}): EmailResult {
  const meta = LEAVE_COLOR[d.leaveTypeCode];
  return {
    subject: `${d.applicantName} requested ${meta.name} — ${d.dateRange}`,
    html: emailShell({
      preheader: `${d.applicantName} has requested ${fmtDaysHtml(d.days)} of ${meta.name}, ${d.dateRange}.`,
      bodyHtml: `
        ${badge("Needs a decision", "info")}
        ${heading("New leave request")}
        ${lede(`Hi ${d.approverFirstName}, <strong>${d.applicantName}</strong> (${d.applicantDesignation}) has requested ${fmtDaysHtml(d.days)} of <strong style="color:${meta.ink};">${meta.name}</strong>.`)}
        ${detailRows([
          ["Dates", d.dateRange],
          ["Duration", fmtDaysHtml(d.days)],
          ["Notice given", d.noticeDays < 0 ? "Retrospective" : `${d.noticeDays} days`],
          ["Reason", d.reason],
        ])}
        ${balanceBlock(d.balanceOnDate, `${d.applicantName.split(" ")[0]}'s ${meta.name} balance, as of ${d.dateRange.split("–")[0].trim()}`)}
        ${d.lopDays > 0 ? calloutWarn(`<strong>${fmtDaysHtml(d.lopDays)} would be unpaid (§13)</strong> — the balance on those dates doesn't fully cover this request.`) : ""}
        ${d.extraApprover ? calloutWarn(`This also needs sign-off from <strong>${d.extraApprover}</strong> once you decide.`) : ""}
        ${d.warnings && d.warnings.length ? d.warnings.map((w) => calloutWarn(w)).join("") : ""}
        ${ctaButton("Review this request", `${APP_URL}/requests/${d.requestId}`)}
      `,
    }),
  };
}

export function leaveSubmittedToApplicantEmail(d: {
  applicantFirstName: string;
  leaveTypeCode: string;
  dateRange: string;
  days: number;
  reason: string;
  approverName: string;
  balance: BalanceLine[];
  lopDays: number;
  requestId: string;
}): EmailResult {
  const meta = LEAVE_COLOR[d.leaveTypeCode];
  return {
    subject: `Your ${meta.name} request has been submitted`,
    html: emailShell({
      preheader: `You've applied for ${fmtDaysHtml(d.days)} of ${meta.name}, ${d.dateRange}.`,
      bodyHtml: `
        ${badge("Awaiting decision", "info")}
        ${heading("Request submitted")}
        ${lede(`Hi ${d.applicantFirstName}, you've applied for ${fmtDaysHtml(d.days)} of <strong style="color:${meta.ink};">${meta.name}</strong>. <strong>${d.approverName}</strong> has been notified and you'll hear back once they decide.`)}
        ${detailRows([
          ["Dates", d.dateRange],
          ["Duration", fmtDaysHtml(d.days)],
          ["Reason", d.reason],
        ])}
        ${balanceBlock(d.balance, `Your ${meta.name} balance`)}
        ${d.lopDays > 0 ? calloutWarn(`<strong>${fmtDaysHtml(d.lopDays)} of this would be unpaid (§13)</strong> if approved — your balance on those dates doesn't fully cover the request.`) : ""}
        ${ctaButton("Track this request", `${APP_URL}/requests/${d.requestId}`)}
      `,
    }),
  };
}

export function leaveDecisionEmail(d: {
  recipientFirstName: string;
  isApplicant: boolean;
  applicantName: string;
  decision: "APPROVED" | "REJECTED";
  deciderName: string;
  leaveTypeCode: string;
  dateRange: string;
  days: number;
  comment?: string;
  balance: BalanceLine[];
  requestId: string;
}): EmailResult {
  const meta = LEAVE_COLOR[d.leaveTypeCode];
  const approved = d.decision === "APPROVED";
  const who = d.isApplicant ? "Your" : `${d.applicantName}'s`;
  const subjectWho = d.isApplicant ? "Your" : `${d.applicantName.split(" ")[0]}'s`;
  return {
    subject: `${subjectWho} ${meta.name} request was ${approved ? "approved" : "rejected"}`,
    html: emailShell({
      preheader: `${who} ${meta.name} request for ${d.dateRange} was ${approved ? "approved" : "rejected"} by ${d.deciderName}.`,
      bodyHtml: `
        ${badge(approved ? "Approved" : "Rejected", approved ? "success" : "danger")}
        ${heading(approved ? "Request approved" : "Request rejected")}
        ${lede(
          d.isApplicant
            ? `Hi ${d.recipientFirstName}, <strong>${d.deciderName}</strong> ${approved ? "approved" : "rejected"} your <strong style="color:${meta.ink};">${meta.name}</strong> request for ${d.dateRange}.`
            : `Hi ${d.recipientFirstName}, <strong>${d.deciderName}</strong> ${approved ? "approved" : "rejected"} <strong>${d.applicantName}</strong>'s <strong style="color:${meta.ink};">${meta.name}</strong> request for ${d.dateRange}.`,
        )}
        ${detailRows([
          ["Dates", d.dateRange],
          ["Duration", fmtDaysHtml(d.days)],
          ...(d.comment ? ([[approved ? "Note" : "Reason", d.comment]] as [string, string][]) : []),
        ])}
        ${approved ? balanceBlock(d.balance, `${who} ${meta.name} balance now`) : ""}
        ${!approved ? paragraph("Nothing was deducted from the balance — this request is now closed.", { muted: true, marginTop: 16 }) : ""}
        ${ctaButton("View request", `${APP_URL}/requests/${d.requestId}`)}
      `,
    }),
  };
}

export function leaveCancelledEmail(d: {
  recipientFirstName: string;
  isApplicant: boolean;
  applicantName: string;
  actorName: string;
  leaveTypeCode: string;
  dateRange: string;
  days: number;
  reason: string;
  balance: BalanceLine[];
  requestId: string;
}): EmailResult {
  const meta = LEAVE_COLOR[d.leaveTypeCode];
  const who = d.isApplicant ? "Your" : `${d.applicantName}'s`;
  return {
    subject: `${d.isApplicant ? "Your" : `${d.applicantName.split(" ")[0]}'s`} ${meta.name} request was cancelled`,
    html: emailShell({
      preheader: `${who} ${meta.name} request for ${d.dateRange} was cancelled.`,
      bodyHtml: `
        ${badge("Cancelled", "warning")}
        ${heading("Request cancelled")}
        ${lede(`Hi ${d.recipientFirstName}, <strong>${d.actorName}</strong> cancelled ${d.isApplicant ? "your" : `${d.applicantName}'s`} <strong style="color:${meta.ink};">${meta.name}</strong> request for ${d.dateRange}. ${d.reason}`)}
        ${detailRows([
          ["Dates", d.dateRange],
          ["Duration", fmtDaysHtml(d.days)],
        ])}
        ${balanceBlock(d.balance, `${who} ${meta.name} balance now`)}
        ${d.isApplicant ? calloutWarn("If you go ahead and take this leave anyway, it will be treated as unauthorised (§16).") : ""}
        ${ctaButton("View request", `${APP_URL}/requests/${d.requestId}`)}
      `,
    }),
  };
}

// ── account lifecycle ────────────────────────────────────────────────────────────

export function newEmployeeWelcomeEmail(d: {
  firstName: string;
  email: string;
  activationUrl: string;
  designation: string;
  expiresInHours: number;
}): EmailResult {
  return {
    subject: "Welcome to LeaveBase, " + d.firstName,
    html: emailShell({
      preheader: "Your LeaveBase account is ready — set your password to get started.",
      bodyHtml: `
        ${heading(`Welcome, ${d.firstName}`)}
        ${lede(`You've been added to <strong>LeaveBase</strong>, Prismix Studios' leave management system, as <strong>${d.designation}</strong>. One step to get in — set your own password, no temporary one to remember.`)}
        ${ctaButton("Set your password", d.activationUrl)}
        ${paragraph(`This link signs in as <strong style="color:${COLOR.ink700};">${d.email}</strong> and expires in ${d.expiresInHours} hours, for one use only. If it's expired by the time you get to it, ask HR to send a fresh one.`, { muted: true, marginTop: 16 })}
        <p style="margin:26px 0 10px;font-size:11px;font-weight:800;letter-spacing:0.05em;text-transform:uppercase;color:${COLOR.ink400};">What happens next</p>
        ${detailRows([
          ["1", "Choose a password on the page the link opens."],
          ["2", "You're straight into your dashboard — no separate sign-in step."],
          ["3", "Your leave balance is already waiting, pro-rated from your joining date."],
          ["4", "Apply for leave any time from “Apply for leave” — approvals route automatically to the right person."],
        ])}
        ${paragraph("Questions about the policy or how anything works? Your reporting manager or HR can help.", { muted: true, marginTop: 20 })}
      `,
    }),
  };
}

export function firstLoginWelcomeEmail(d: { firstName: string }): EmailResult {
  return {
    subject: "You're all set on LeaveBase",
    html: emailShell({
      preheader: "Your account is active — your balance is up to date and ready to use.",
      bodyHtml: `
        ${badge("Account active", "success")}
        ${heading(`Welcome aboard, ${d.firstName}`)}
        ${lede("Your LeaveBase account is now active. Your leave balance is already up to date, and applying takes just a couple of clicks whenever you need to.")}
        ${detailRows([
          ["Apply for leave", `<a href="${APP_URL}/apply" style="color:${COLOR.brand500};font-weight:700;text-decoration:none;">Start a request →</a>`],
          ["Your balance", `<a href="${APP_URL}" style="color:${COLOR.brand500};font-weight:700;text-decoration:none;">View dashboard →</a>`],
          ["The policy", `<a href="${APP_URL}/policy" style="color:${COLOR.brand500};font-weight:700;text-decoration:none;">Read it here →</a>`],
        ])}
        ${ctaButton("Open LeaveBase", APP_URL)}
      `,
    }),
  };
}

export function firstLoginTeamEmail(d: {
  recipientFirstName: string;
  employeeName: string;
  designation: string;
  department: string;
  employeeId: string;
}): EmailResult {
  return {
    subject: `${d.employeeName} just activated their LeaveBase account`,
    html: emailShell({
      preheader: `${d.employeeName} signed in for the first time and is now on LeaveBase.`,
      bodyHtml: `
        ${badge("New activation", "info")}
        ${heading("A new account is active")}
        ${lede(`Hi ${d.recipientFirstName}, <strong>${d.employeeName}</strong> signed in for the first time and is now part of the LeaveBase ecosystem.`)}
        ${detailRows([
          ["Name", d.employeeName],
          ["Designation", d.designation],
          ["Department", d.department],
        ])}
        ${ctaButton("View their record", `${APP_URL}/employees/${d.employeeId}`)}
      `,
    }),
  };
}

export function passwordResetEmail(d: {
  firstName: string;
  email: string;
  resetUrl: string;
  actorName: string;
  expiresInHours: number;
}): EmailResult {
  return {
    subject: "Your LeaveBase password has been reset",
    html: emailShell({
      preheader: `${d.actorName} reset your password — set a new one to get back in.`,
      bodyHtml: `
        ${badge("Security", "warning")}
        ${heading("Your password was reset")}
        ${lede(`Hi ${d.firstName}, <strong>${d.actorName}</strong> reset your LeaveBase password. Set a new one to get back in — nothing to type or copy.`)}
        ${ctaButton("Set a new password", d.resetUrl)}
        ${paragraph(`This link signs in as <strong style="color:${COLOR.ink700};">${d.email}</strong> and expires in ${d.expiresInHours} hours, for one use only.`, { muted: true, marginTop: 16 })}
        ${calloutWarn(`<strong>Didn't ask for this?</strong> Contact HR immediately — someone with access to your record triggered it.`)}
      `,
    }),
  };
}

export function passwordChangedEmail(d: { firstName: string; when: string }): EmailResult {
  return {
    subject: "Your LeaveBase password was changed",
    html: emailShell({
      preheader: `Your password was changed on ${d.when}.`,
      bodyHtml: `
        ${badge("Security", "success")}
        ${heading("Password changed")}
        ${lede(`Hi ${d.firstName}, this confirms your LeaveBase password was changed on <strong>${d.when}</strong>.`)}
        ${calloutWarn(`<strong>Wasn't you?</strong> Contact HR immediately so your access can be secured.`)}
      `,
    }),
  };
}

// ── comp-off (§11) ──────────────────────────────────────────────────────────────

export function compOffClaimedEmail(d: {
  approverFirstName: string;
  employeeName: string;
  workedDate: string;
  workedDayLabel: string;
  expiresDate: string;
  claimId: string;
}): EmailResult {
  return {
    subject: `${d.employeeName} claimed a comp-off — ${d.workedDate}`,
    html: emailShell({
      preheader: `${d.employeeName} worked ${d.workedDayLabel} on ${d.workedDate} and claimed a comp-off for it.`,
      bodyHtml: `
        ${badge("Needs a decision", "info")}
        ${heading("Comp-off claim")}
        ${lede(`Hi ${d.approverFirstName}, <strong>${d.employeeName}</strong> worked <strong>${d.workedDayLabel}</strong> on ${d.workedDate} and has claimed a compensatory day off for it.`)}
        ${detailRows([
          ["Worked", `${d.workedDate} — ${d.workedDayLabel}`],
          ["Expires", `${d.expiresDate}, if not used (§11)`],
        ])}
        ${ctaButton("Review claim", `${APP_URL}/comp-off`)}
      `,
    }),
  };
}

export function compOffDecisionEmail(d: {
  employeeFirstName: string;
  decision: "APPROVED" | "REJECTED";
  deciderName: string;
  workedDate: string;
  expiresDate?: string;
  comment?: string;
}): EmailResult {
  const approved = d.decision === "APPROVED";
  return {
    subject: `Your comp-off claim was ${approved ? "approved" : "rejected"}`,
    html: emailShell({
      preheader: `${d.deciderName} ${approved ? "approved" : "rejected"} your comp-off claim for ${d.workedDate}.`,
      bodyHtml: `
        ${badge(approved ? "Approved" : "Rejected", approved ? "success" : "danger")}
        ${heading(approved ? "Comp-off approved" : "Comp-off rejected")}
        ${lede(`Hi ${d.employeeFirstName}, <strong>${d.deciderName}</strong> ${approved ? "approved" : "rejected"} your comp-off claim for working <strong>${d.workedDate}</strong>.`)}
        ${
          approved
            ? detailRows([["Valid until", `${d.expiresDate} — use it before then (§11)`]])
            : d.comment
              ? detailRows([["Reason", d.comment]])
              : ""
        }
        ${ctaButton("View comp-off", `${APP_URL}/comp-off`)}
      `,
    }),
  };
}

export function compOffExpiringEmail(d: {
  employeeFirstName: string;
  count: number;
  workedDate: string;
  expiresDate: string;
  daysLeft: number;
}): EmailResult {
  return {
    subject: `Your comp-off expires in ${d.daysLeft} ${d.daysLeft === 1 ? "day" : "days"} — use it or lose it`,
    html: emailShell({
      preheader: `Your comp-off from ${d.workedDate} expires ${d.expiresDate}.`,
      bodyHtml: `
        ${badge("Expiring soon", "warning")}
        ${heading("Use it before it lapses")}
        ${lede(`Hi ${d.employeeFirstName}, you have <strong>${fmtDaysHtml(d.count)}</strong> of comp-off from working <strong>${d.workedDate}</strong>, expiring <strong>${d.expiresDate}</strong> — ${d.daysLeft} ${d.daysLeft === 1 ? "day" : "days"} away. Comp-off doesn't carry forward (§11).`)}
        ${ctaButton("Use it now", `${APP_URL}/comp-off`)}
      `,
    }),
  };
}

// ── employment ────────────────────────────────────────────────────────────────

export function employeeConfirmedEmail(d: {
  employeeFirstName: string;
  confirmDate: string;
  balance: BalanceLine[];
}): EmailResult {
  return {
    subject: "You've been confirmed at Prismix Studios",
    html: emailShell({
      preheader: "Congratulations — you're confirmed, and Privileged Leave is now available to you.",
      bodyHtml: `
        ${badge("Confirmed", "success")}
        ${heading("Congratulations!")}
        ${lede(`Hi ${d.employeeFirstName}, you've been confirmed at Prismix Studios effective <strong>${d.confirmDate}</strong>. Privileged Leave is now available to you, credited pro-rata from today (§6, §7).`)}
        ${balanceBlock(d.balance, "Your balance now")}
        ${ctaButton("View your balance", `${APP_URL}/requests?tab=balance`)}
      `,
    }),
  };
}

// ── absence (§12) ────────────────────────────────────────────────────────────────

export function absenceFlaggedEmail(d: {
  recipientFirstName: string;
  employeeName: string;
  severity: "WARNING" | "ABSCONDING";
  workingDays: number;
  dateRange: string;
  abscondingThreshold: number;
  employeeId: string;
}): EmailResult {
  const abs = d.severity === "ABSCONDING";
  return {
    subject: abs
      ? `${d.employeeName} — absconding threshold reached`
      : `${d.employeeName} — unauthorised absence flagged`,
    html: emailShell({
      preheader: `${d.workingDays} consecutive working days of unauthorised absence recorded for ${d.employeeName}.`,
      bodyHtml: `
        ${badge(abs ? "Absconding threshold" : "Absence warning", abs ? "danger" : "warning")}
        ${heading(abs ? "Absconding threshold reached" : "Unauthorised absence flagged")}
        ${lede(`Hi ${d.recipientFirstName}, <strong>${d.employeeName}</strong> has ${fmtDaysHtml(d.workingDays)} of recorded unauthorised absence, ${d.dateRange}.`)}
        ${
          abs
            ? calloutWarn(`Section 12 treats ${d.abscondingThreshold} or more consecutive working days as absconding — the decision rests with HR, not the system.`)
            : calloutWarn(`The absconding threshold under section 12 is ${d.abscondingThreshold} working days.`)
        }
        ${ctaButton("Review employee record", `${APP_URL}/employees/${d.employeeId}`)}
      `,
    }),
  };
}

// ── HR corrections ───────────────────────────────────────────────────────────────

export function balanceAdjustedEmail(d: {
  employeeFirstName: string;
  actorName: string;
  leaveTypeCode: string;
  amount: number;
  note: string;
  balance: BalanceLine[];
}): EmailResult {
  const meta = LEAVE_COLOR[d.leaveTypeCode];
  const sign = d.amount > 0 ? "+" : "";
  return {
    subject: `Your ${meta.name} balance was adjusted`,
    html: emailShell({
      preheader: `${d.actorName} adjusted your ${meta.name} balance by ${sign}${d.amount} days.`,
      bodyHtml: `
        ${badge("Manual correction", "info")}
        ${heading("Balance adjusted")}
        ${lede(`Hi ${d.employeeFirstName}, <strong>${d.actorName}</strong> made a manual correction to your <strong style="color:${meta.ink};">${meta.name}</strong> balance.`)}
        ${detailRows([
          ["Adjustment", `<span style="color:${d.amount > 0 ? COLOR.successInk : COLOR.dangerInk};">${sign}${d.amount} days</span>`],
          ["Reason", d.note],
        ])}
        ${balanceBlock(d.balance, `Your ${meta.name} balance now`)}
        ${paragraph("This is a ledger entry, not an overwrite — your original accrual and usage stay visible in your statement.", { muted: true, marginTop: 16 })}
        ${ctaButton("View your balance", `${APP_URL}/requests?tab=balance`)}
      `,
    }),
  };
}

// ── accrual (§7) ─────────────────────────────────────────────────────────────────

export function accrualPostedEmail(d: {
  employeeFirstName: string;
  periodLabel: string;
  leaveYearLabel: string;
  balance: BalanceLine[];
}): EmailResult {
  return {
    subject: `Your ${d.periodLabel} leave credit has landed`,
    html: emailShell({
      preheader: `Your ${d.leaveYearLabel} ${d.periodLabel} accrual has been credited.`,
      bodyHtml: `
        ${heading("Leave credited")}
        ${lede(`Hi ${d.employeeFirstName}, your <strong>${d.periodLabel} ${d.leaveYearLabel}</strong> leave accrual has been credited (§7).`)}
        ${balanceBlock(d.balance, "Your balance now")}
        ${paragraph("This happens automatically each quarter — nothing for you to do.", { muted: true, marginTop: 16 })}
      `,
    }),
  };
}
