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
  tempPassword: string;
  designation: string;
}): EmailResult {
  return {
    subject: "Welcome to LeaveBase, " + d.firstName,
    html: emailShell({
      preheader: "Your LeaveBase account is ready — here's your temporary password and how to get started.",
      bodyHtml: `
        ${heading(`Welcome, ${d.firstName}`)}
        ${lede(`You've been added to <strong>LeaveBase</strong>, Prismix Studios' leave management system, as <strong>${d.designation}</strong>. Here's everything you need to sign in.`)}
        ${card(`
          <p style="margin:0 0 10px;font-size:11px;font-weight:800;letter-spacing:0.05em;text-transform:uppercase;color:${COLOR.ink400};">Your sign-in details</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:5px 0;font-size:12.5px;color:${COLOR.ink500};">Work email</td><td style="padding:5px 0;font-size:13px;font-weight:700;color:${COLOR.ink900};text-align:right;">${d.email}</td></tr>
            <tr><td style="padding:5px 0;font-size:12.5px;color:${COLOR.ink500};">Temporary password</td><td style="padding:5px 0;text-align:right;"><code style="font-family:'SF Mono',Consolas,monospace;font-size:13px;font-weight:700;background:${COLOR.brand50};color:${COLOR.brand500};padding:3px 9px;border-radius:6px;letter-spacing:0.02em;">${d.tempPassword}</code></td></tr>
          </table>
        `)}
        ${calloutWarn("This password works once. The moment you sign in, LeaveBase will ask you to set your own — don't forward this email once you've done that.")}
        <p style="margin:24px 0 10px;font-size:11px;font-weight:800;letter-spacing:0.05em;text-transform:uppercase;color:${COLOR.ink400};">Getting started</p>
        ${detailRows([
          ["1", `Go to <a href="${APP_URL}/login" style="color:${COLOR.brand500};font-weight:700;text-decoration:none;">${APP_URL.replace("https://", "")}</a> and sign in with the details above.`],
          ["2", "Set a new password when prompted — it replaces the temporary one immediately."],
          ["3", "Your leave balance is already waiting on your dashboard, pro-rated from your joining date."],
          ["4", "Apply for leave any time from “Apply for leave” — approvals route automatically to the right person."],
        ])}
        ${ctaButton("Sign in to LeaveBase", `${APP_URL}/login`)}
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
  tempPassword: string;
  actorName: string;
}): EmailResult {
  return {
    subject: "Your LeaveBase password has been reset",
    html: emailShell({
      preheader: `${d.actorName} reset your password — here's your temporary one.`,
      bodyHtml: `
        ${badge("Security", "warning")}
        ${heading("Your password was reset")}
        ${lede(`Hi ${d.firstName}, <strong>${d.actorName}</strong> reset your LeaveBase password. Use the temporary one below to sign in.`)}
        ${card(`
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:5px 0;font-size:12.5px;color:${COLOR.ink500};">Work email</td><td style="padding:5px 0;font-size:13px;font-weight:700;color:${COLOR.ink900};text-align:right;">${d.email}</td></tr>
            <tr><td style="padding:5px 0;font-size:12.5px;color:${COLOR.ink500};">Temporary password</td><td style="padding:5px 0;text-align:right;"><code style="font-family:'SF Mono',Consolas,monospace;font-size:13px;font-weight:700;background:${COLOR.brand50};color:${COLOR.brand500};padding:3px 9px;border-radius:6px;letter-spacing:0.02em;">${d.tempPassword}</code></td></tr>
          </table>
        `)}
        ${calloutWarn(`<strong>Didn't ask for this?</strong> Contact HR immediately — someone with access to your record triggered it.`)}
        ${ctaButton("Sign in and set a new password", `${APP_URL}/login`)}
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
