/** Domain vocabulary + the presentation metadata that travels with it. */

import type { PolicyConfig } from "./config";

export const LEAVE_TYPES = [
  "CL",
  "SL",
  "PL",
  "MATERNITY",
  "PATERNITY",
  "COMP_OFF",
  "LOP",
] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

/** The types that draw from an accruing annual balance and appear on the balance dashboard. */
export const BALANCE_TYPES: LeaveType[] = ["CL", "SL", "PL", "COMP_OFF"];

/** §8 GEN.NO_CLUBBING — the three that may not be clubbed with each other. */
export const NON_CLUBBABLE: LeaveType[] = ["CL", "SL", "PL"];

export type LeaveTypeMeta = {
  code: LeaveType;
  name: string;
  short: string;
  /** Tailwind-facing CSS custom-property token stem, e.g. "cl" → var(--lt-cl) */
  token: string;
  clause: string;
  blurb: string;
  /** Does this type consume an accruing balance? */
  accrues: boolean;
  /** Can it be applied for retrospectively? (§15 exempts only SL) */
  retrospective: boolean;
  /** Can it be a half-day? (§14) */
  halfDayAllowed: boolean;
};

export const LEAVE_META: Record<LeaveType, LeaveTypeMeta> = {
  CL: {
    code: "CL",
    name: "Casual Leave",
    short: "CL",
    token: "cl",
    clause: "§4",
    blurb: "For casual, general or unforeseen situations — not long vacations. Lapses on 31 March.",
    accrues: true,
    retrospective: false,
    halfDayAllowed: true,
  },
  SL: {
    code: "SL",
    name: "Sick Leave",
    short: "SL",
    token: "sl",
    clause: "§5",
    blurb: "For medical reasons. May be applied retrospectively. Carries forward without limit.",
    accrues: true,
    retrospective: true,
    halfDayAllowed: true,
  },
  PL: {
    code: "PL",
    name: "Privileged Leave",
    short: "PL",
    token: "pl",
    clause: "§6",
    blurb: "Planned leave for confirmed employees. Needs advance notice; carries forward up to a ceiling.",
    accrues: true,
    retrospective: false,
    halfDayAllowed: true,
  },
  MATERNITY: {
    code: "MATERNITY",
    name: "Maternity Leave",
    short: "ML",
    token: "mat",
    clause: "§9",
    blurb: "Up to 26 weeks. Requires written notice to HR and a medical certificate.",
    accrues: false,
    retrospective: false,
    halfDayAllowed: false,
  },
  PATERNITY: {
    code: "PATERNITY",
    name: "Paternity Leave",
    short: "PT",
    token: "pat",
    clause: "§10",
    blurb: "Five days for biological fathers, for care of the newborn and spouse.",
    accrues: false,
    retrospective: false,
    halfDayAllowed: false,
  },
  COMP_OFF: {
    code: "COMP_OFF",
    name: "Compensatory Off",
    short: "CO",
    token: "co",
    clause: "§11",
    blurb: "Earned by working a holiday or weekly off with prior approval. Expires 20 days after the day worked.",
    accrues: true,
    retrospective: false,
    halfDayAllowed: false,
  },
  LOP: {
    code: "LOP",
    name: "Loss of Pay",
    short: "LOP",
    token: "lop",
    clause: "§13",
    blurb: "Unpaid absence. Applied when leave is unapproved or taken without available balance.",
    accrues: false,
    retrospective: true,
    halfDayAllowed: true,
  },
};

export function annualEntitlement(type: LeaveType, cfg: PolicyConfig): number {
  switch (type) {
    case "CL": return cfg.clPerYear;
    case "SL": return cfg.slPerYear;
    case "PL": return cfg.plPerYear;
    case "PATERNITY": return cfg.paternityDays;
    case "MATERNITY": return cfg.maternityTotalWeeks * 7;
    case "COMP_OFF": return cfg.compOffMaxPerYear;
    default: return 0;
  }
}

// ── roles ─────────────────────────────────────────────────────────────────────

export const ROLES = ["EMPLOYEE", "MANAGER", "HOD", "HR", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  EMPLOYEE: "Employee",
  MANAGER: "Reporting Manager",
  HOD: "Head of Department",
  HR: "Human Resources",
  ADMIN: "Administrator",
};

/** Roles that can see organisation-wide data and act on any employee. */
export function isHrOrAdmin(role: string): boolean {
  return role === "HR" || role === "ADMIN";
}

/** Roles that have an approval inbox. */
export function canApprove(role: string): boolean {
  return role === "MANAGER" || role === "HOD" || role === "HR" || role === "ADMIN";
}

// ── statuses ──────────────────────────────────────────────────────────────────

export const REQUEST_STATUSES = [
  "PENDING",
  "PENDING_HOD",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "WITHDRAWN",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  PENDING_HOD: "With HOD",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  WITHDRAWN: "Withdrawn",
  EXPIRED: "Expired",
  CONSUMED: "Used",
};

export const OPEN_STATUSES = ["PENDING", "PENDING_HOD"];

export type EmploymentStatus = "PROBATION" | "CONFIRMED" | "RESIGNED" | "EXITED";

export const EMPLOYMENT_STATUS_LABEL: Record<string, string> = {
  PROBATION: "On probation",
  CONFIRMED: "Confirmed",
  RESIGNED: "Serving notice",
  EXITED: "Exited",
};

export const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACT: "Fixed-term / Contract",
  CONSULTANT: "Consultant",
};

export type HalfDay = "NONE" | "FIRST_HALF" | "SECOND_HALF";

export const HALF_DAY_LABEL: Record<HalfDay, string> = {
  NONE: "Full day",
  FIRST_HALF: "First half (first four hours)",
  SECOND_HALF: "Second half (last four hours)",
};

export type DayType = "WORKING" | "WEEKLY_OFF" | "HOLIDAY";
