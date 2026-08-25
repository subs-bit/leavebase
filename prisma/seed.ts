/**
 * Seed — a realistic Prismix Studios organisation as of the demo date.
 *
 * Imports only the *pure* policy modules (never the `server-only` service layer), and posts the
 * same ledger entries the running application would, so balances shown after seeding are exactly
 * what the rule engine would have produced.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { buildBreakdown, makeContext } from "../src/lib/policy/calendar";
import { DEFAULT_POLICY } from "../src/lib/policy/config";
import {
  accrualSchedule, computeCarryForward, leaveYearOf, toEligibility,
} from "../src/lib/policy/leave-year";
import { addDaysKey, dayKey, diffDays, fromKey, minKey } from "../src/lib/date";
import type { DayKey } from "../src/lib/date";
import type { HalfDay, LeaveType } from "../src/lib/policy/types";

const db = new PrismaClient();

/** The demo "today". Everything is arranged to look alive on this date. */
const TODAY: DayKey = "2026-08-24";
const PASSWORD = "prismix";
const cfg = DEFAULT_POLICY;
const LY = leaveYearOf(TODAY, cfg);

// ── holidays ──────────────────────────────────────────────────────────────────

const HOLIDAYS: { date: DayKey; name: string; type: string }[] = [
  { date: "2026-04-03", name: "Good Friday", type: "DECLARED" },
  { date: "2026-04-14", name: "Dr. Ambedkar Jayanti", type: "NATIONAL" },
  { date: "2026-05-01", name: "Maharashtra Day", type: "NATIONAL" },
  { date: "2026-08-15", name: "Independence Day", type: "NATIONAL" },
  { date: "2026-09-14", name: "Ganesh Chaturthi", type: "DECLARED" },
  { date: "2026-10-02", name: "Gandhi Jayanti", type: "NATIONAL" },
  { date: "2026-10-20", name: "Dussehra", type: "DECLARED" },
  { date: "2026-11-09", name: "Diwali", type: "DECLARED" },
  { date: "2026-11-10", name: "Diwali — Balipratipada", type: "DECLARED" },
  { date: "2026-12-25", name: "Christmas Day", type: "DECLARED" },
  { date: "2027-01-01", name: "New Year's Day", type: "DECLARED" },
  { date: "2027-01-26", name: "Republic Day", type: "NATIONAL" },
  { date: "2027-03-22", name: "Holi", type: "DECLARED" },
];

// ── org ───────────────────────────────────────────────────────────────────────

const DEPARTMENTS = [
  { code: "BA", name: "Business Affairs" },
  { code: "CR", name: "Creative" },
  { code: "PR", name: "Production" },
  { code: "PP", name: "Post-Production" },
  { code: "TE", name: "Technology" },
  { code: "PC", name: "People & Culture" },
];

type SeedUser = {
  key: string;
  name: string;
  email: string;
  designation: string;
  role: string;
  dept: string;
  managerKey?: string;
  gender: "MALE" | "FEMALE";
  joinDate: DayKey;
  confirmDate?: DayKey | null;
  status?: string;
  employmentType?: string;
  resignDate?: DayKey;
  lastWorkingDay?: DayKey;
  hue: number;
  isHod?: boolean;
};

const USERS: SeedUser[] = [
  // Founders & leadership
  { key: "vatsal", name: "Vatsal Sheth", email: "vatsal.sheth@prismixstudios.com", designation: "Co-Founder & Chief Executive Officer", role: "ADMIN", dept: "BA", gender: "MALE", joinDate: "2019-04-01", confirmDate: "2019-04-01", status: "CONFIRMED", hue: 262 },
  { key: "sahil", name: "Sahil Nayar", email: "sahil.nayar@prismixstudios.com", designation: "Co-Founder & Chief Creative Officer", role: "ADMIN", dept: "CR", managerKey: "vatsal", gender: "MALE", joinDate: "2019-04-01", confirmDate: "2019-04-01", status: "CONFIRMED", hue: 196, isHod: true },
  { key: "daanish", name: "Daanish Devgn", email: "daanish.devgn@prismixstudios.com", designation: "Co-Founder & Chief Business Officer", role: "ADMIN", dept: "BA", managerKey: "vatsal", gender: "FEMALE", joinDate: "2019-04-01", confirmDate: "2019-04-01", status: "CONFIRMED", hue: 300, isHod: true },
  { key: "ashish", name: "Ashish Parpani", email: "ashish.parpani@prismixstudios.com", designation: "Consulting HR Partner", role: "HR", dept: "PC", managerKey: "vatsal", gender: "MALE", joinDate: "2023-06-01", confirmDate: "2023-12-01", status: "CONFIRMED", employmentType: "CONSULTANT", hue: 152, isHod: true },

  // Business Affairs
  { key: "rhea", name: "Rhea Kapoor", email: "rhea.kapoor@prismixstudios.com", designation: "Finance Lead", role: "MANAGER", dept: "BA", managerKey: "daanish", gender: "FEMALE", joinDate: "2022-02-14", confirmDate: "2022-08-14", status: "CONFIRMED", hue: 330 },
  { key: "karan", name: "Karan Mehta", email: "karan.mehta@prismixstudios.com", designation: "Legal Associate", role: "EMPLOYEE", dept: "BA", managerKey: "rhea", gender: "MALE", joinDate: "2024-07-08", confirmDate: "2025-01-08", status: "CONFIRMED", hue: 218 },
  { key: "aditi", name: "Aditi Rao", email: "aditi.rao@prismixstudios.com", designation: "Finance Executive", role: "EMPLOYEE", dept: "BA", managerKey: "rhea", gender: "FEMALE", joinDate: "2026-06-15", confirmDate: null, status: "PROBATION", hue: 22 },

  // Creative
  { key: "ishaan", name: "Ishaan Verma", email: "ishaan.verma@prismixstudios.com", designation: "Creative Director", role: "MANAGER", dept: "CR", managerKey: "sahil", gender: "MALE", joinDate: "2021-09-06", confirmDate: "2022-03-06", status: "CONFIRMED", hue: 174 },
  { key: "nikita", name: "Nikita Shah", email: "nikita.shah@prismixstudios.com", designation: "Art Director", role: "EMPLOYEE", dept: "CR", managerKey: "ishaan", gender: "FEMALE", joinDate: "2023-03-20", confirmDate: "2023-09-20", status: "CONFIRMED", hue: 286 },
  { key: "rohan", name: "Rohan Pillai", email: "rohan.pillai@prismixstudios.com", designation: "Senior Copywriter", role: "EMPLOYEE", dept: "CR", managerKey: "ishaan", gender: "MALE", joinDate: "2022-11-01", confirmDate: "2023-05-01", status: "CONFIRMED", hue: 40 },
  { key: "meera", name: "Meera Iyer", email: "meera.iyer@prismixstudios.com", designation: "Concept Artist", role: "EMPLOYEE", dept: "CR", managerKey: "ishaan", gender: "FEMALE", joinDate: "2026-07-01", confirmDate: null, status: "PROBATION", hue: 340 },

  // Production
  { key: "arjun", name: "Arjun Nair", email: "arjun.nair@prismixstudios.com", designation: "Head of Production", role: "HOD", dept: "PR", managerKey: "vatsal", gender: "MALE", joinDate: "2020-08-17", confirmDate: "2021-02-17", status: "CONFIRMED", hue: 210, isHod: true },
  { key: "sneha", name: "Sneha Menon", email: "sneha.menon@prismixstudios.com", designation: "Line Producer", role: "MANAGER", dept: "PR", managerKey: "arjun", gender: "FEMALE", joinDate: "2021-11-22", confirmDate: "2022-05-22", status: "CONFIRMED", hue: 168 },
  { key: "vikram", name: "Vikram Singh", email: "vikram.singh@prismixstudios.com", designation: "Production Coordinator", role: "EMPLOYEE", dept: "PR", managerKey: "sneha", gender: "MALE", joinDate: "2024-01-15", confirmDate: "2024-07-15", status: "CONFIRMED", hue: 250 },
  { key: "tanvi", name: "Tanvi Desai", email: "tanvi.desai@prismixstudios.com", designation: "Production Assistant", role: "EMPLOYEE", dept: "PR", managerKey: "sneha", gender: "FEMALE", joinDate: "2025-09-01", confirmDate: "2026-03-01", status: "CONFIRMED", hue: 12 },
  { key: "faiz", name: "Faiz Ahmed", email: "faiz.ahmed@prismixstudios.com", designation: "Assistant Director", role: "EMPLOYEE", dept: "PR", managerKey: "sneha", gender: "MALE", joinDate: "2023-08-07", confirmDate: "2024-02-07", status: "CONFIRMED", hue: 128 },

  // Post-Production
  { key: "ananya", name: "Ananya Ghosh", email: "ananya.ghosh@prismixstudios.com", designation: "Head of Post-Production", role: "HOD", dept: "PP", managerKey: "sahil", gender: "FEMALE", joinDate: "2020-02-03", confirmDate: "2020-08-03", status: "CONFIRMED", hue: 312, isHod: true },
  { key: "dev", name: "Dev Malhotra", email: "dev.malhotra@prismixstudios.com", designation: "Editorial Lead", role: "MANAGER", dept: "PP", managerKey: "ananya", gender: "MALE", joinDate: "2022-06-13", confirmDate: "2022-12-13", status: "CONFIRMED", hue: 232 },
  { key: "priya", name: "Priya Raman", email: "priya.raman@prismixstudios.com", designation: "Senior Editor", role: "EMPLOYEE", dept: "PP", managerKey: "dev", gender: "FEMALE", joinDate: "2023-01-09", confirmDate: "2023-07-09", status: "CONFIRMED", hue: 350 },
  { key: "sameer", name: "Sameer Joshi", email: "sameer.joshi@prismixstudios.com", designation: "Colourist", role: "EMPLOYEE", dept: "PP", managerKey: "dev", gender: "MALE", joinDate: "2024-04-22", confirmDate: "2024-10-22", status: "CONFIRMED", hue: 186 },
  { key: "zoya", name: "Zoya Khan", email: "zoya.khan@prismixstudios.com", designation: "VFX Artist", role: "EMPLOYEE", dept: "PP", managerKey: "dev", gender: "FEMALE", joinDate: "2025-02-10", confirmDate: "2025-08-10", status: "CONFIRMED", hue: 274 },

  // Technology
  { key: "kabir", name: "Kabir Sethi", email: "kabir.sethi@prismixstudios.com", designation: "Head of Technology", role: "HOD", dept: "TE", managerKey: "vatsal", gender: "MALE", joinDate: "2021-05-04", confirmDate: "2021-11-04", status: "CONFIRMED", hue: 202, isHod: true },
  { key: "neha", name: "Neha Bhat", email: "neha.bhat@prismixstudios.com", designation: "Engineering Manager", role: "MANAGER", dept: "TE", managerKey: "kabir", gender: "FEMALE", joinDate: "2022-09-19", confirmDate: "2023-03-19", status: "CONFIRMED", hue: 158 },
  { key: "aryan", name: "Aryan Gupta", email: "aryan.gupta@prismixstudios.com", designation: "Pipeline Engineer", role: "EMPLOYEE", dept: "TE", managerKey: "neha", gender: "MALE", joinDate: "2024-10-14", confirmDate: "2025-04-14", status: "CONFIRMED", hue: 240 },
  { key: "ritika", name: "Ritika Sharma", email: "ritika.sharma@prismixstudios.com", designation: "Systems Administrator", role: "EMPLOYEE", dept: "TE", managerKey: "neha", gender: "FEMALE", joinDate: "2023-11-06", confirmDate: "2024-05-06", status: "RESIGNED", resignDate: "2026-08-01", lastWorkingDay: "2026-09-30", hue: 296 },

  // People & Culture
  { key: "sara", name: "Sara Dsouza", email: "sara.dsouza@prismixstudios.com", designation: "HR Executive", role: "EMPLOYEE", dept: "PC", managerKey: "ashish", gender: "FEMALE", joinDate: "2025-04-28", confirmDate: "2025-10-28", status: "CONFIRMED", hue: 138 },
];

// ── leave requests ────────────────────────────────────────────────────────────

type SeedRequest = {
  who: string;
  type: LeaveType;
  start: DayKey;
  end: DayKey;
  half?: HalfDay;
  reason: string;
  status: "APPROVED" | "PENDING" | "PENDING_HOD" | "REJECTED" | "CANCELLED";
  comment?: string;
  hasMedicalDoc?: boolean;
  appliedDaysBefore?: number;
};

const REQUESTS: SeedRequest[] = [
  // ── settled history ──
  { who: "nikita", type: "PL", start: "2026-05-11", end: "2026-05-15", reason: "Family holiday in Coorg.", status: "APPROVED", appliedDaysBefore: 34 },
  { who: "rohan", type: "CL", start: "2026-06-08", end: "2026-06-08", reason: "Apartment registration appointment.", status: "APPROVED", appliedDaysBefore: 6 },
  { who: "vikram", type: "SL", start: "2026-06-22", end: "2026-06-23", reason: "Viral fever.", status: "APPROVED", appliedDaysBefore: 0 },
  { who: "priya", type: "PL", start: "2026-07-06", end: "2026-07-10", reason: "Wedding in the family — Jaipur.", status: "APPROVED", appliedDaysBefore: 40 },
  { who: "faiz", type: "CL", start: "2026-07-17", end: "2026-07-17", reason: "Personal errand.", status: "APPROVED", appliedDaysBefore: 4 },
  { who: "sameer", type: "SL", start: "2026-07-27", end: "2026-07-30", reason: "Dengue — hospitalised two days.", status: "APPROVED", hasMedicalDoc: true, appliedDaysBefore: 0 },
  { who: "zoya", type: "CL", start: "2026-08-04", end: "2026-08-04", half: "FIRST_HALF", reason: "Passport appointment, back by 2pm.", status: "APPROVED", appliedDaysBefore: 3 },
  // The §8 sandwich in the wild: Friday before Independence Day weekend.
  { who: "aryan", type: "CL", start: "2026-08-14", end: "2026-08-17", reason: "Extending the Independence Day weekend — cousin's wedding.", status: "APPROVED", appliedDaysBefore: 12 },
  { who: "tanvi", type: "SL", start: "2026-08-18", end: "2026-08-19", reason: "Food poisoning.", status: "APPROVED", appliedDaysBefore: 0 },
  { who: "karan", type: "CL", start: "2026-08-21", end: "2026-08-21", reason: "Court filing deadline — personal matter.", status: "APPROVED", appliedDaysBefore: 5 },

  // ── awaiting a decision right now ──
  { who: "rohan", type: "PL", start: "2026-09-21", end: "2026-09-25", reason: "Annual trip to Ladakh — booked flights.", status: "PENDING_HOD", appliedDaysBefore: 3 },
  { who: "vikram", type: "CL", start: "2026-09-03", end: "2026-09-03", reason: "Sister's convocation.", status: "PENDING", appliedDaysBefore: 2 },
  { who: "meera", type: "CL", start: "2026-09-07", end: "2026-09-08", reason: "Moving apartments.", status: "PENDING", appliedDaysBefore: 1 },
  { who: "priya", type: "PL", start: "2026-10-19", end: "2026-10-21", reason: "Dussehra with family in Chennai.", status: "PENDING", appliedDaysBefore: 4 },
  { who: "sara", type: "CL", start: "2026-09-01", end: "2026-09-01", reason: "Dentist — root canal.", status: "PENDING", appliedDaysBefore: 3 },
  { who: "zoya", type: "PL", start: "2026-11-06", end: "2026-11-13", reason: "Diwali at home in Lucknow.", status: "PENDING_HOD", appliedDaysBefore: 6 },
  { who: "faiz", type: "COMP_OFF", start: "2026-09-04", end: "2026-09-04", reason: "Comp-off against the Independence Day shoot.", status: "PENDING", appliedDaysBefore: 2 },

  // ── decided the other way ──
  { who: "tanvi", type: "PL", start: "2026-09-09", end: "2026-09-11", reason: "Short break.", status: "REJECTED", comment: "We're mid-shoot on the Nagpur schedule and you're the only PA on the unit. Happy to approve the same dates in October — please re-apply.", appliedDaysBefore: 20 },
  { who: "nikita", type: "CL", start: "2026-08-27", end: "2026-08-27", reason: "Personal.", status: "CANCELLED", comment: "Withdrawn — the appointment moved.", appliedDaysBefore: 6 },
];

type SeedCompOff = {
  who: string;
  worked: DayKey;
  reason: string;
  status: "PENDING" | "APPROVED" | "EXPIRED";
};

const COMP_OFFS: SeedCompOff[] = [
  { who: "faiz", worked: "2026-08-15", reason: "Independence Day shoot at Film City — full day on unit.", status: "APPROVED" },
  { who: "vikram", worked: "2026-08-16", reason: "Sunday — equipment load-out after the shoot.", status: "APPROVED" },
  { who: "aryan", worked: "2026-08-09", reason: "Sunday — render farm migration during downtime window.", status: "APPROVED" },
  { who: "sameer", worked: "2026-08-22", reason: "Saturday grade session for the Kotak film delivery.", status: "PENDING" },
  { who: "priya", worked: "2026-08-23", reason: "Sunday — client review cut turnaround.", status: "PENDING" },
  { who: "dev", worked: "2026-07-19", reason: "Sunday — emergency re-export for broadcast QC.", status: "EXPIRED" },
];

type SeedAbsence = {
  who: string;
  from: DayKey;
  to: DayKey;
  note: string;
};

/**
 * §12/§13 — unauthorised absence is *recorded*, never inferred from missing leave. These are the
 * records the absconding detector reads.
 */
const ABSENCES: SeedAbsence[] = [
  {
    who: "meera",
    from: "2026-08-05",
    to: "2026-08-10",
    note: "Did not report from Wednesday and did not respond to calls or email. Reached on 11 Aug — family emergency, no prior intimation given.",
  },
];

// ── helpers ───────────────────────────────────────────────────────────────────

let ledgerSeq = 0;

async function main() {
  console.log("Clearing…");
  await db.$transaction([
    db.auditLog.deleteMany(),
    db.notification.deleteMany(),
    db.absenceFlag.deleteMany(),
    db.leaveLedger.deleteMany(),
    db.compOffCredit.deleteMany(),
    db.approval.deleteMany(),
    db.leaveRequestDay.deleteMany(),
    db.leaveRequest.deleteMany(),
    db.session.deleteMany(),
    db.holiday.deleteMany(),
    db.policySetting.deleteMany(),
  ]);
  // Users and departments reference each other, so clear them after the rest.
  await db.user.updateMany({ data: { managerId: null, departmentId: null } });
  await db.department.updateMany({ data: { hodId: null } });
  await db.user.deleteMany();
  await db.department.deleteMany();

  console.log("Policy settings…");
  await db.policySetting.create({
    data: { id: "singleton", json: JSON.stringify(cfg) },
  });

  console.log("Holidays…");
  await db.holiday.createMany({
    data: HOLIDAYS.map((h) => ({
      date: fromKey(h.date),
      name: h.name,
      type: h.type,
      year: Number(h.date.slice(0, 4)),
    })),
  });

  console.log("Departments…");
  const deptIds = new Map<string, string>();
  for (const d of DEPARTMENTS) {
    const row = await db.department.create({ data: { code: d.code, name: d.name } });
    deptIds.set(d.code, row.id);
  }

  console.log("People…");
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const userIds = new Map<string, string>();

  // Pass 1 — create everyone without manager links.
  let n = 1;
  for (const u of USERS) {
    const row = await db.user.create({
      data: {
        empCode: `PRX${String(n).padStart(3, "0")}`,
        name: u.name,
        email: u.email,
        passwordHash,
        role: u.role,
        designation: u.designation,
        gender: u.gender,
        employmentType: u.employmentType ?? "FULL_TIME",
        status: u.status ?? "CONFIRMED",
        joinDate: fromKey(u.joinDate),
        confirmDate: u.confirmDate ? fromKey(u.confirmDate) : null,
        resignDate: u.resignDate ? fromKey(u.resignDate) : null,
        lastWorkingDay: u.lastWorkingDay ? fromKey(u.lastWorkingDay) : null,
        departmentId: deptIds.get(u.dept)!,
        avatarHue: u.hue,
        location: "Mumbai",
        phone: `+91 ${90000 + n * 137} ${10000 + n * 331}`.slice(0, 18),
      },
    });
    userIds.set(u.key, row.id);
    n++;
  }

  // Pass 2 — manager links and department heads.
  for (const u of USERS) {
    if (u.managerKey) {
      await db.user.update({
        where: { id: userIds.get(u.key)! },
        data: { managerId: userIds.get(u.managerKey)! },
      });
    }
    if (u.isHod) {
      await db.department.update({
        where: { id: deptIds.get(u.dept)! },
        data: { hodId: userIds.get(u.key)! },
      });
    }
  }

  console.log("Opening balances and accrual…");
  for (const u of USERS) {
    const id = userIds.get(u.key)!;
    const emp = toEligibility({
      joinDate: u.joinDate,
      confirmDate: u.confirmDate ?? null,
      lastWorkingDay: u.lastWorkingDay ?? null,
      status: u.status ?? "CONFIRMED",
    });

    // Carry-forward from the previous year for anyone who was here (§5 SL, §6 PL).
    if (u.joinDate < LY.start) {
      const tenureYears = (fromKey(LY.start).getTime() - fromKey(u.joinDate).getTime()) / (365 * 86400000);
      const priorPl = Math.min(cfg.plAccumulationCap, Math.round(Math.min(tenureYears * 3.5, 26) * 2) / 2);
      const priorSl = Math.round(Math.min(tenureYears * 2.2, 14) * 2) / 2;

      for (const [type, amount] of [["PL", priorPl], ["SL", priorSl]] as const) {
        if (amount <= 0) continue;
        const rolled = computeCarryForward(type, amount, cfg);
        if (rolled.lapsed > 0) {
          await postLedger(id, type, "LAPSE", -rolled.lapsed, LY.start, rolled.ruleId, rolled.note);
        }
        if (rolled.carried > 0) {
          await postLedger(id, type, "OPENING", rolled.carried, LY.start, rolled.ruleId,
            "Carried forward from 2025-26");
        }
      }
    }

    // §7 quarterly accrual, for every quarter that has begun by the demo date.
    for (const type of ["CL", "SL", "PL"] as const) {
      for (const line of accrualSchedule(type, emp, LY, cfg, TODAY)) {
        if (!line.credited || line.amount <= 0) continue;
        await postLedger(id, type, "ACCRUAL", line.amount, line.period.start,
          type === "PL" && u.confirmDate ? "ACCRUAL.PL_ON_CONFIRM" : "ACCRUAL.QUARTERLY",
          `${line.period.label} ${LY.label} pro-rata credit`);
      }
    }
  }

  console.log("Comp-off claims…");
  const compOffIds = new Map<string, string>();
  for (const c of COMP_OFFS) {
    const userId = userIds.get(c.who)!;
    const holiday = HOLIDAYS.find((h) => h.date === c.worked);
    const expiresAt = addDaysKey(c.worked, cfg.compOffExpiryDays);
    const manager = USERS.find((u) => u.key === c.who)?.managerKey;

    const row = await db.compOffCredit.create({
      data: {
        userId,
        workedDate: fromKey(c.worked),
        workedDayType: holiday ? "HOLIDAY" : "WEEKLY_OFF",
        reason: c.reason,
        status: c.status,
        expiresAt: fromKey(expiresAt),
        leaveYear: LY.label,
        approvedById: c.status === "PENDING" ? null : manager ? userIds.get(manager)! : null,
        approvedAt: c.status === "PENDING" ? null : fromKey(addDaysKey(c.worked, 1)),
      },
    });
    compOffIds.set(`${c.who}:${c.worked}`, row.id);

    if (c.status === "APPROVED") {
      await postLedger(userId, "COMP_OFF", "COMP_CREDIT", 1, c.worked, "CO.CLAIM_FIRST",
        `Worked ${c.worked} — expires ${expiresAt}`);
    }
    if (c.status === "EXPIRED") {
      await postLedger(userId, "COMP_OFF", "COMP_CREDIT", 1, c.worked, "CO.CLAIM_FIRST",
        `Worked ${c.worked}`);
      await postLedger(userId, "COMP_OFF", "LAPSE", -1, expiresAt, "CO.EXPIRY_20",
        "Lapsed — not availed within 20 days");
    }
  }

  console.log("Leave requests…");
  const ctxCache = new Map<string, ReturnType<typeof makeContext>>();
  let reqNo = 1;

  for (const r of REQUESTS) {
    const userId = userIds.get(r.who)!;
    const seedUser = USERS.find((u) => u.key === r.who)!;

    // Build the calendar context including this person's already-created leave, so the sandwich
    // rule behaves exactly as it would in the app.
    const priorDays = await db.leaveRequestDay.findMany({
      where: { request: { userId, status: { in: ["PENDING", "PENDING_HOD", "APPROVED"] } } },
      select: { date: true, charged: true },
    });
    const ctx = makeContext({
      weeklyOffs: cfg.weeklyOffs,
      holidays: HOLIDAYS,
      existingLeaveDays: priorDays.map((d) => dayKey(d.date)),
      alreadyChargedDays: priorDays.filter((d) => d.charged > 0).map((d) => dayKey(d.date)),
    });

    const breakdown = buildBreakdown({
      start: r.start, end: r.end, leaveType: r.type, halfDay: r.half ?? "NONE", ctx,
    });

    // An application can never be dated in the future — clamp to the demo date.
    const appliedKey = minKey(addDaysKey(r.start, -(r.appliedDaysBefore ?? 5)), TODAY);
    const appliedAt = new Date(fromKey(appliedKey).getTime() + 10 * 3600 * 1000);
    const noticeDays = diffDays(appliedKey, r.start);
    // A decision lands a day after the application, but never in the future.
    const NOW = Date.now();
    const decidedAt = new Date(Math.min(appliedAt.getTime() + 86400000, NOW));
    const longRun = r.type === "PL" && breakdown.consecutiveRun > cfg.plShortRunMax;

    // Approval chain (§6 dual approval for long PL).
    const managerId = seedUser.managerKey ? userIds.get(seedUser.managerKey)! : userIds.get("ashish")!;
    const deptHodKey = USERS.find((u) => u.dept === seedUser.dept && u.isHod)?.key;
    const hodId = deptHodKey && deptHodKey !== r.who ? userIds.get(deptHodKey)! : userIds.get("ashish")!;

    const chain: { approverId: string; level: number; label: string }[] = [
      { approverId: managerId, level: 1, label: "Reporting Manager" },
    ];
    if (longRun && hodId !== managerId) {
      chain.push({ approverId: hodId, level: 2, label: "Head of Department" });
    }

    const request = await db.leaveRequest.create({
      data: {
        code: `LV-2026-${String(reqNo++).padStart(4, "0")}`,
        userId,
        leaveType: r.type,
        startDate: fromKey(r.start),
        endDate: fromKey(r.end),
        halfDay: r.half ?? "NONE",
        chargedDays: breakdown.chargedDays,
        calendarDays: breakdown.calendarDays,
        reason: r.reason,
        status: r.status,
        appliedAt,
        decidedAt: ["APPROVED", "REJECTED", "CANCELLED"].includes(r.status) ? decidedAt : null,
        noticeDays,
        hasMedicalDoc: r.hasMedicalDoc ?? false,
        cancelReason: r.status === "CANCELLED" ? (r.comment ?? "") : "",
        policySnapshot: JSON.stringify({
          chargedDays: breakdown.chargedDays,
          consecutiveRun: breakdown.consecutiveRun,
          sandwichedDays: breakdown.sandwichedDays,
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

    for (const step of chain) {
      const isDecided = ["APPROVED", "REJECTED"].includes(r.status);
      const isLastPendingLevel = r.status === "PENDING_HOD" && step.level === 2;
      const action =
        r.status === "APPROVED" ? "APPROVED"
        : r.status === "REJECTED" ? (step.level === 1 ? "REJECTED" : "SKIPPED")
        : r.status === "CANCELLED" ? "SKIPPED"
        : isLastPendingLevel ? "PENDING"
        : r.status === "PENDING_HOD" ? "APPROVED"
        : "PENDING";

      await db.approval.create({
        data: {
          requestId: request.id,
          approverId: step.approverId,
          level: step.level,
          levelLabel: step.label,
          action,
          comment: action === "REJECTED" ? (r.comment ?? "") : action === "APPROVED" && r.status === "PENDING_HOD" ? "Cover is arranged — over to you." : "",
          actedAt: action === "PENDING" || action === "SKIPPED" ? null : decidedAt,
        },
      });
    }

    // Approved leave debits the ledger. Any shortfall against the balance becomes Loss of Pay
    // rather than a negative balance — the same split submitRequest() performs (§13 LOP.NO_BALANCE).
    if (r.status === "APPROVED" && r.type !== "LOP") {
      const available = await availableFor(userId, r.type);
      const lopDays = Math.max(0, Math.round((breakdown.chargedDays - available) * 2) / 2);
      const payable = Math.round((breakdown.chargedDays - lopDays) * 2) / 2;

      if (payable > 0) {
        await postLedger(userId, r.type, "AVAIL", -payable, r.start, "",
          `${r.type} — ${r.start}${r.start !== r.end ? ` to ${r.end}` : ""}`, request.id);
      }
      if (lopDays > 0) {
        await db.leaveRequest.update({
          where: { id: request.id },
          data: { isLop: true, lopDays },
        });
      }
    }

    // A pending comp-off request holds a credit until it is decided.
    if (r.status === "APPROVED" && r.type === "COMP_OFF") {
      const credit = await db.compOffCredit.findFirst({
        where: { userId, status: "APPROVED" }, orderBy: { expiresAt: "asc" },
      });
      if (credit) {
        await db.compOffCredit.update({
          where: { id: credit.id },
          data: { status: "CONSUMED", consumedById: request.id },
        });
      }
    }
  }

  console.log("Unauthorised absence…");
  for (const a of ABSENCES) {
    const userId = userIds.get(a.who)!;
    const ctx = makeContext({ weeklyOffs: cfg.weeklyOffs, holidays: HOLIDAYS });
    const breakdown = buildBreakdown({
      start: a.from, end: a.to, leaveType: "LOP", halfDay: "NONE", ctx,
    });
    // Working days only — Loss of Pay draws no balance, so a holiday inside the run is not a day
    // of pay to withhold. Mirrors recordUnauthorisedAbsence().
    const lines = breakdown.lines.map((l) =>
      l.dayType === "WORKING"
        ? l
        : { ...l, charged: 0, reason: `${l.label} — not a working day, no pay withheld` },
    );
    const workingDays = lines.reduce((sum, l) => sum + l.charged, 0);

    await db.leaveRequest.create({
      data: {
        code: `AB-2026-${String(reqNo++).padStart(4, "0")}`,
        userId,
        leaveType: "LOP",
        startDate: fromKey(a.from),
        endDate: fromKey(a.to),
        chargedDays: workingDays,
        calendarDays: breakdown.calendarDays,
        reason: a.note,
        status: "APPROVED",
        appliedAt: fromKey(a.to),
        decidedAt: fromKey(a.to),
        noticeDays: 0,
        isLop: true,
        lopDays: workingDays,
        policySnapshot: JSON.stringify({ ruleId: "ABS.LWP" }),
        days: {
          create: lines.map((l) => ({
            date: fromKey(l.date),
            dayType: l.dayType,
            charged: l.charged,
            reason: l.reason,
            label: l.label,
          })),
        },
      },
    });

    if (workingDays >= cfg.absenceWarningDays) {
      await db.absenceFlag.create({
        data: {
          userId,
          fromDate: fromKey(a.from),
          toDate: fromKey(a.to),
          workingDays,
          severity: workingDays >= cfg.abscondingDays ? "ABSCONDING" : "WARNING",
          note: `${workingDays} consecutive working days of recorded unauthorised absence. The absconding threshold under section 12 is ${cfg.abscondingDays}.`,
        },
      });
    }
  }

  console.log("Notifications…");
  const pending = await db.approval.findMany({
    where: { action: "PENDING", request: { status: { in: ["PENDING", "PENDING_HOD"] } } },
    include: { request: { include: { user: { select: { name: true } } } } },
  });
  for (const a of pending) {
    await db.notification.create({
      data: {
        userId: a.approverId,
        kind: "REQUEST_SUBMITTED",
        title: `${a.request.user.name} requested ${a.request.leaveType === "COMP_OFF" ? "compensatory off" : a.request.leaveType}`,
        body: `${dayKey(a.request.startDate)} — ${a.request.chargedDays} day(s)`,
        link: `/requests/${a.requestId}`,
        createdAt: a.request.appliedAt,
      },
    });
  }

  await db.auditLog.create({
    data: {
      actorName: "System",
      action: "SEED",
      entity: "System",
      summary: `Seeded ${USERS.length} employees, ${REQUESTS.length} leave requests and ${COMP_OFFS.length} comp-off claims for ${LY.label}`,
    },
  });

  console.log("");
  console.log(`  ${USERS.length} employees across ${DEPARTMENTS.length} departments`);
  console.log(`  ${REQUESTS.length} leave requests · ${COMP_OFFS.length} comp-off claims · ${ABSENCES.length} absence record · ${HOLIDAYS.length} holidays`);
  console.log(`  Leave year ${LY.label} (${LY.start} → ${LY.end}), demo date ${TODAY}`);
  console.log("");
  console.log("  Sign in with any of these — password for all accounts is: " + PASSWORD);
  console.log("    vatsal.sheth@prismixstudios.com    Administrator / CEO");
  console.log("    ashish.parpani@prismixstudios.com  HR");
  console.log("    arjun.nair@prismixstudios.com      Head of Department");
  console.log("    sneha.menon@prismixstudios.com     Reporting Manager");
  console.log("    aryan.gupta@prismixstudios.com     Employee");
  console.log("    meera.iyer@prismixstudios.com      Employee on probation");
  console.log("");
}

/** Current available balance for a type, straight off the ledger. */
async function availableFor(userId: string, leaveType: string): Promise<number> {
  const rows = await db.leaveLedger.findMany({
    where: { userId, leaveYear: LY.label, leaveType },
    select: { amount: true },
  });
  return Math.round(rows.reduce((sum, r) => sum + r.amount, 0) * 2) / 2;
}

async function postLedger(
  userId: string,
  leaveType: string,
  entryKind: string,
  amount: number,
  effectiveDate: DayKey,
  ruleId: string,
  note: string,
  requestId?: string,
) {
  ledgerSeq++;
  await db.leaveLedger.create({
    data: {
      userId,
      leaveYear: LY.label,
      leaveType,
      entryKind,
      amount,
      effectiveDate: fromKey(effectiveDate),
      ruleId,
      note,
      requestId: requestId ?? null,
      createdAt: new Date(fromKey(effectiveDate).getTime() + ledgerSeq * 1000),
    },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
