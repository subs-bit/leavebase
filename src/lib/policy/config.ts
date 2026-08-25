/**
 * Policy configuration.
 *
 * Everything the Prismix Leave Policy states as a *number* lives here rather than in code, so HR
 * can correct a value (notably the CL entitlement, which the source PDF states ambiguously as
 * "Six (04)") without a deployment. Defaults below are the policy as written, resolved per
 * docs/POLICY_SPEC.md.
 */

export type PolicyConfig = {
  /** §3 — leave year start month, 1-indexed. 4 = April (financial year). */
  leaveYearStartMonth: number;
  /** §3 — policy effective date. */
  effectiveFrom: string;

  /** §4 CL.ENTITLE — annual Casual Leave grant. Source PDF says "Six (04)"; resolved to 6. */
  clPerYear: number;
  /** §5 SL.ENTITLE — annual Sick Leave grant. */
  slPerYear: number;
  /** §6 PL.ENTITLE — annual Privileged Leave grant for confirmed employees. */
  plPerYear: number;
  /** §10 PAT.ENTITLE — paternity days. */
  paternityDays: number;

  /** §6 PL.CAP_30 — PL accumulation ceiling at any point in time. */
  plAccumulationCap: number;
  /** §6 PL.NOTICE_15 — advance notice for runs of PL up to `plShortRunMax` days. */
  plNoticeShort: number;
  /** §6 PL.NOTICE_30 — advance notice for longer runs. */
  plNoticeLong: number;
  /** §6 — "up to three consecutive PLs" boundary. */
  plShortRunMax: number;

  /** §5 SL.MEDICAL_DOC — consecutive SL days beyond which medical proof is required. */
  slMedicalDocAfter: number;

  /** §9 — maternity split: weeks allowed before delivery / after delivery. */
  maternityPreWeeks: number;
  maternityPostWeeks: number;
  /** §9 — alternative: whole entitlement taken after delivery. */
  maternityTotalWeeks: number;
  /** §9 ML.NOTICE_90 — days of written notice to HR. */
  maternityNoticeDays: number;

  /** §11 CO.EXPIRY_20 — days within which a comp-off must be availed. */
  compOffExpiryDays: number;
  /** §11 CO.MAX_15 — comp-offs available per year. */
  compOffMaxPerYear: number;

  /** §12 ABS.ABSCOND_6 — consecutive working days of unauthorised absence = absconding. */
  abscondingDays: number;
  /** Early-warning threshold, raised before the absconding line is crossed. */
  absenceWarningDays: number;

  /** §18 MGR.COVERAGE — max team members on leave the same day before a coverage warning. */
  maxConcurrentPerTeam: number;

  /** §4 CL.PURPOSE — CL run length beyond which we nudge toward PL. */
  clLongRunNudge: number;

  /** Weekly offs, 0=Sun … 6=Sat. */
  weeklyOffs: number[];

  /**
   * §7 accrual cadence. The policy as written states quarterly — a quarter of the entitlement
   * credited at the start of each quarter. "ANNUAL" is an administrator's deliberate departure
   * from that: the whole pro-rata entitlement is credited in one lump the moment someone becomes
   * eligible, rather than trickled in over the year.
   */
  accrualCadence: "QUARTERLY" | "ANNUAL";
};

export const DEFAULT_POLICY: PolicyConfig = {
  leaveYearStartMonth: 4,
  effectiveFrom: "2026-07-01",

  clPerYear: 6,
  slPerYear: 6,
  plPerYear: 15,
  paternityDays: 5,

  plAccumulationCap: 30,
  plNoticeShort: 15,
  plNoticeLong: 30,
  plShortRunMax: 3,

  slMedicalDocAfter: 2,

  maternityPreWeeks: 8,
  maternityPostWeeks: 18,
  maternityTotalWeeks: 26,
  maternityNoticeDays: 90,

  compOffExpiryDays: 20,
  compOffMaxPerYear: 15,

  abscondingDays: 6,
  absenceWarningDays: 4,

  maxConcurrentPerTeam: 2,

  clLongRunNudge: 4,

  weeklyOffs: [0, 6],

  accrualCadence: "QUARTERLY",
};

/** Merge a stored partial config over the defaults, ignoring unknown keys. */
export function resolvePolicy(stored?: string | null): PolicyConfig {
  if (!stored) return { ...DEFAULT_POLICY };
  try {
    const parsed = JSON.parse(stored) as Partial<PolicyConfig>;
    const out = { ...DEFAULT_POLICY };
    for (const k of Object.keys(DEFAULT_POLICY) as (keyof PolicyConfig)[]) {
      if (parsed[k] !== undefined && parsed[k] !== null) {
        // @ts-expect-error — key-wise copy across a heterogeneous record
        out[k] = parsed[k];
      }
    }
    return out;
  } catch {
    return { ...DEFAULT_POLICY };
  }
}

/**
 * Field metadata for the Policy Settings screen — label, the clause it comes from, and any
 * caveat HR should see. Keeping this next to the config keeps the two from drifting.
 */
export const POLICY_FIELDS: {
  key: keyof PolicyConfig;
  label: string;
  clause: string;
  unit: string;
  group: string;
  note?: string;
  min?: number;
  max?: number;
}[] = [
  { key: "clPerYear", label: "Casual Leave per year", clause: "§4", unit: "days", group: "Entitlements", min: 0, max: 60,
    note: "The source policy reads \"Six (04)\" — the word and numeral disagree. Confirmed as 6." },
  { key: "slPerYear", label: "Sick Leave per year", clause: "§5", unit: "days", group: "Entitlements", min: 0, max: 60 },
  { key: "plPerYear", label: "Privileged Leave per year", clause: "§6", unit: "days", group: "Entitlements", min: 0, max: 60 },
  { key: "paternityDays", label: "Paternity Leave", clause: "§10", unit: "days", group: "Entitlements", min: 0, max: 90 },

  { key: "plAccumulationCap", label: "PL accumulation ceiling", clause: "§6", unit: "days", group: "Privileged Leave", min: 0, max: 120,
    note: "PL above this ceiling lapses automatically; the quota is held at the cap." },
  { key: "plShortRunMax", label: "Short-run PL boundary", clause: "§6", unit: "consecutive days", group: "Privileged Leave", min: 1, max: 30 },
  { key: "plNoticeShort", label: "Notice for short PL runs", clause: "§6", unit: "days in advance", group: "Privileged Leave", min: 0, max: 120 },
  { key: "plNoticeLong", label: "Notice for long PL runs", clause: "§6", unit: "days in advance", group: "Privileged Leave", min: 0, max: 180,
    note: "Runs beyond the short-run boundary also require Head of Department approval." },

  { key: "slMedicalDocAfter", label: "Medical proof required after", clause: "§5", unit: "consecutive SL days", group: "Sick Leave", min: 1, max: 30,
    note: "Without documents the leave is deducted from Privileged Leave instead." },

  { key: "maternityPreWeeks", label: "Maternity — pre-delivery", clause: "§9", unit: "weeks", group: "Parental", min: 0, max: 26 },
  { key: "maternityPostWeeks", label: "Maternity — post-delivery", clause: "§9", unit: "weeks", group: "Parental", min: 0, max: 52 },
  { key: "maternityTotalWeeks", label: "Maternity — total", clause: "§9", unit: "weeks", group: "Parental", min: 0, max: 52 },
  { key: "maternityNoticeDays", label: "Maternity notice to HR", clause: "§9", unit: "days", group: "Parental", min: 0, max: 365 },

  { key: "compOffExpiryDays", label: "Comp-off must be availed within", clause: "§11", unit: "days", group: "Compensatory", min: 1, max: 365 },
  { key: "compOffMaxPerYear", label: "Comp-offs per year", clause: "§11", unit: "days", group: "Compensatory", min: 0, max: 60 },

  { key: "abscondingDays", label: "Absconding threshold", clause: "§12", unit: "working days", group: "Absence", min: 2, max: 30,
    note: "LeaveBase raises a flag for HR — it never terminates anyone automatically." },
  { key: "absenceWarningDays", label: "Early absence warning at", clause: "§12", unit: "working days", group: "Absence", min: 1, max: 30 },

  { key: "maxConcurrentPerTeam", label: "Max team members on leave per day", clause: "§18", unit: "people", group: "Approvals", min: 1, max: 50,
    note: "A soft coverage warning shown to approvers — it does not block approval." },
  { key: "clLongRunNudge", label: "Nudge toward PL after", clause: "§4", unit: "consecutive CL days", group: "Approvals", min: 1, max: 30,
    note: "Casual Leave is not intended for long vacations." },
];
