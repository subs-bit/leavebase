import "server-only";

import { db } from "@/lib/db";
import { parseCsv, parseFlexibleDate, parseOptionalNumber, toCsv } from "@/lib/csv";
import type { CsvRow } from "@/lib/csv";
import { todayKey } from "@/lib/date";
import { audit } from "./activity";
import { createEmployee, nextEmpCode, postOpeningBalances, updateEmployee } from "./people";
import { BALANCE_TYPES, EMPLOYMENT_TYPE_LABEL, ROLES } from "@/lib/policy/types";
import type { LeaveType, Role } from "@/lib/policy/types";

export const IMPORT_COLUMNS = [
  { key: "name", required: true, note: "Full name" },
  { key: "email", required: true, note: "Work email — this is their sign-in" },
  { key: "designation", required: false, note: "Job title" },
  { key: "empcode", required: false, note: "Blank assigns the next PRX number" },
  { key: "department", required: false, note: "Matched by name; created if new" },
  { key: "manageremail", required: false, note: "Email of their reporting manager" },
  { key: "role", required: false, note: "employee | manager | hod | hr | admin" },
  { key: "gender", required: false, note: "female | male | other — gates §9/§10" },
  { key: "employmenttype", required: false, note: "full_time | part_time | contract | consultant" },
  { key: "status", required: false, note: "probation | confirmed | resigned" },
  { key: "joindate", required: true, note: "YYYY-MM-DD or DD/MM/YYYY" },
  { key: "confirmdate", required: false, note: "Required if status is confirmed" },
  { key: "phone", required: false, note: "" },
  { key: "location", required: false, note: "" },
  { key: "openingcl", required: false, note: "Casual Leave remaining today" },
  { key: "openingsl", required: false, note: "Sick Leave remaining today" },
  { key: "openingpl", required: false, note: "Privileged Leave remaining today" },
  { key: "openingcompoff", required: false, note: "Comp-off credits remaining today" },
] as const;

export type RowVerdict = {
  line: number;
  name: string;
  email: string;
  action: "CREATE" | "UPDATE" | "ERROR";
  errors: string[];
  warnings: string[];
  summary: string;
};

export type ImportPlan = {
  ok: boolean;
  rows: RowVerdict[];
  newDepartments: string[];
  counts: { create: number; update: number; error: number };
  fatal?: string;
};

const ROLE_ALIASES: Record<string, Role> = {
  employee: "EMPLOYEE", staff: "EMPLOYEE", member: "EMPLOYEE",
  manager: "MANAGER", reportingmanager: "MANAGER", lead: "MANAGER",
  hod: "HOD", headofdepartment: "HOD", head: "HOD",
  hr: "HR", humanresources: "HR",
  admin: "ADMIN", administrator: "ADMIN",
};

const TYPE_ALIASES: Record<string, string> = {
  fulltime: "FULL_TIME", full_time: "FULL_TIME", permanent: "FULL_TIME", ft: "FULL_TIME",
  parttime: "PART_TIME", part_time: "PART_TIME", pt: "PART_TIME",
  contract: "CONTRACT", fixedterm: "CONTRACT", fixed_term: "CONTRACT",
  consultant: "CONSULTANT", consulting: "CONSULTANT",
};

const STATUS_ALIASES: Record<string, string> = {
  probation: "PROBATION", onprobation: "PROBATION", probationary: "PROBATION",
  confirmed: "CONFIRMED", permanent: "CONFIRMED", active: "CONFIRMED",
  resigned: "RESIGNED", servingnotice: "RESIGNED", notice: "RESIGNED",
};

const GENDER_ALIASES: Record<string, string> = {
  f: "FEMALE", female: "FEMALE", woman: "FEMALE",
  m: "MALE", male: "MALE", man: "MALE",
  other: "OTHER", "": "UNSPECIFIED",
};

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_-]/g, "");

export function importTemplateCsv(): string {
  const headers = IMPORT_COLUMNS.map((c) => c.key);
  const example = [
    "Priya Raman", "priya.raman@prismixstudios.com", "Senior Editor", "", "Post-Production",
    "dev.malhotra@prismixstudios.com", "employee", "female", "full_time", "confirmed",
    "2023-01-09", "2023-07-09", "+91 98200 11111", "Mumbai", "3", "6.5", "11", "0",
  ];
  const example2 = [
    "Arjun Nair", "arjun.nair@prismixstudios.com", "Head of Production", "", "Production",
    "", "hod", "male", "full_time", "confirmed",
    "2020-08-17", "2021-02-17", "", "Mumbai", "2", "9", "18", "1",
  ];
  return toCsv([headers as unknown as string[], example, example2]);
}

/**
 * Validate an import without writing anything.
 *
 * Every row is checked against the same rules the single-employee form uses, plus cross-row
 * checks a form can't do: duplicate emails inside the file, managers that appear later in the
 * file, and departments that don't exist yet.
 */
export async function planImport(csvText: string): Promise<ImportPlan> {
  const parsed = parseCsv(csvText);
  if (parsed.error) {
    return { ok: false, rows: [], newDepartments: [], counts: { create: 0, update: 0, error: 0 }, fatal: parsed.error };
  }

  const missing = IMPORT_COLUMNS.filter((c) => c.required && !parsed.headers.includes(c.key));
  if (missing.length > 0) {
    return {
      ok: false, rows: [], newDepartments: [], counts: { create: 0, update: 0, error: 0 },
      fatal: `The file is missing required column${missing.length === 1 ? "" : "s"}: ${missing.map((m) => m.key).join(", ")}. Download the template to see the expected headers.`,
    };
  }

  const [existingUsers, existingDepts] = await Promise.all([
    db.user.findMany({ select: { id: true, email: true, name: true } }),
    db.department.findMany({ select: { id: true, name: true } }),
  ]);

  const byEmail = new Map(existingUsers.map((u) => [u.email.toLowerCase(), u]));
  const deptByName = new Map(existingDepts.map((d) => [norm(d.name), d]));
  const emailsInFile = new Map<string, number>();
  const newDepartments = new Set<string>();

  // Pass 1 — collect emails so a manager listed further down still resolves.
  for (const row of parsed.rows) {
    const email = (row.email ?? "").trim().toLowerCase();
    if (email) emailsInFile.set(email, Number(row.__line));
  }

  const rows: RowVerdict[] = [];
  const seen = new Set<string>();

  for (const row of parsed.rows) {
    const line = Number(row.__line);
    const errors: string[] = [];
    const warnings: string[] = [];

    const name = (row.name ?? "").trim();
    const email = (row.email ?? "").trim().toLowerCase();

    if (name.length < 2) errors.push("Name is missing.");
    if (!email) errors.push("Email is missing.");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push(`"${email}" isn't a valid email.`);
    else if (seen.has(email)) errors.push("This email appears more than once in the file.");
    seen.add(email);

    const joinDate = parseFlexibleDate(row.joindate ?? "");
    if (!joinDate) errors.push(`Joining date "${row.joindate ?? ""}" isn't a date we can read.`);

    const confirmRaw = (row.confirmdate ?? "").trim();
    const confirmDate = confirmRaw ? parseFlexibleDate(confirmRaw) : null;
    if (confirmRaw && !confirmDate) errors.push(`Confirmation date "${confirmRaw}" isn't a date we can read.`);
    if (joinDate && confirmDate && confirmDate < joinDate) {
      errors.push("Confirmation date is before the joining date.");
    }

    const status = STATUS_ALIASES[norm(row.status ?? "")] ?? (confirmDate ? "CONFIRMED" : "PROBATION");
    if ((row.status ?? "").trim() && !STATUS_ALIASES[norm(row.status)]) {
      warnings.push(`Status "${row.status}" wasn't recognised — using ${status}.`);
    }
    if (status === "CONFIRMED" && !confirmDate) {
      errors.push("A confirmed employee needs a confirmation date — it's what opens Privileged Leave (§6).");
    }

    const role = ROLE_ALIASES[norm(row.role ?? "")] ?? "EMPLOYEE";
    if ((row.role ?? "").trim() && !ROLE_ALIASES[norm(row.role)]) {
      warnings.push(`Role "${row.role}" wasn't recognised — using Employee.`);
    }

    const employmentType = TYPE_ALIASES[norm(row.employmenttype ?? "")] ?? "FULL_TIME";
    if ((row.employmenttype ?? "").trim() && !TYPE_ALIASES[norm(row.employmenttype)]) {
      warnings.push(`Employment type "${row.employmenttype}" wasn't recognised — using Full-time.`);
    }

    const gender = GENDER_ALIASES[norm(row.gender ?? "")] ?? "UNSPECIFIED";
    if (gender === "UNSPECIFIED" && (row.gender ?? "").trim()) {
      warnings.push(`Gender "${row.gender}" wasn't recognised — maternity and paternity eligibility will be unset.`);
    }

    const deptName = (row.department ?? "").trim();
    const deptIsNew = !!deptName && !deptByName.has(norm(deptName));
    if (deptIsNew) warnings.push(`Department "${deptName}" will be created.`);

    const managerEmail = (row.manageremail ?? "").trim().toLowerCase();
    if (managerEmail) {
      if (managerEmail === email) errors.push("Someone can't be their own reporting manager.");
      else if (!byEmail.has(managerEmail) && !emailsInFile.has(managerEmail)) {
        errors.push(`Manager "${managerEmail}" isn't in LeaveBase or anywhere in this file.`);
      }
    } else {
      warnings.push("No reporting manager — their leave will route to HR.");
    }

    for (const [col, type] of [
      ["openingcl", "CL"], ["openingsl", "SL"], ["openingpl", "PL"], ["openingcompoff", "COMP_OFF"],
    ] as const) {
      const v = parseOptionalNumber(row[col] ?? "");
      if (v !== null && Number.isNaN(v)) errors.push(`${col} "${row[col]}" isn't a number.`);
      else if (v !== null && (v < 0 || v > 400)) errors.push(`${col} of ${v} is out of range.`);
      if (type === "PL" && v && v > 0 && status === "PROBATION") {
        warnings.push("Privileged Leave opening balance on a probationer — §6 says PL starts at confirmation.");
      }
    }

    const existing = email ? byEmail.get(email) : undefined;
    const action: RowVerdict["action"] = errors.length > 0 ? "ERROR" : existing ? "UPDATE" : "CREATE";

    // Only promise a new department if the row referencing it will actually import — otherwise a
    // skipped row would leave an empty department behind.
    if (deptIsNew && action !== "ERROR") newDepartments.add(deptName);

    rows.push({
      line,
      name: name || "(no name)",
      email: email || "(no email)",
      action,
      errors,
      warnings,
      summary:
        action === "ERROR" ? "Will be skipped"
        : action === "UPDATE" ? `Updates ${existing!.name}`
        : `New ${role === "EMPLOYEE" ? "employee" : role.toLowerCase()}${deptName ? ` in ${deptName}` : ""}`,
    });
  }

  const counts = {
    create: rows.filter((r) => r.action === "CREATE").length,
    update: rows.filter((r) => r.action === "UPDATE").length,
    error: rows.filter((r) => r.action === "ERROR").length,
  };

  return { ok: counts.error === 0 && rows.length > 0, rows, newDepartments: [...newDepartments], counts };
}

/**
 * Commit an import. Rows with errors are skipped, never guessed at.
 * Runs in two passes so manager references inside the file resolve regardless of row order.
 */
export async function commitImport(
  csvText: string,
  actor: { id: string; role: string },
): Promise<{ created: number; updated: number; skipped: number; departments: number; errors: string[] }> {
  const plan = await planImport(csvText);
  if (plan.fatal) return { created: 0, updated: 0, skipped: 0, departments: 0, errors: [plan.fatal] };

  const parsed = parseCsv(csvText);
  const byLine = new Map(plan.rows.map((r) => [r.line, r]));

  // Departments first, so people can be attached to them.
  const deptByName = new Map(
    (await db.department.findMany({ select: { id: true, name: true } })).map((d) => [norm(d.name), d]),
  );
  let departments = 0;
  for (const name of plan.newDepartments) {
    if (deptByName.has(norm(name))) continue;
    const base = name.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 4) || "DEP";
    let code = base;
    for (let i = 2; await db.department.findFirst({ where: { code } }); i++) code = `${base}${i}`;
    const dept = await db.department.create({ data: { name: name.trim(), code } });
    deptByName.set(norm(name), dept);
    departments++;
  }

  const errors: string[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  const toApply = parsed.rows.filter((r) => byLine.get(Number(r.__line))?.action !== "ERROR");
  skipped = parsed.rows.length - toApply.length;

  // Pass 1 — people, without manager links.
  for (const row of toApply) {
    const email = row.email.trim().toLowerCase();
    const verdict = byLine.get(Number(row.__line))!;
    const joinDate = parseFlexibleDate(row.joindate)!;
    const confirmRaw = (row.confirmdate ?? "").trim();
    const confirmDate = confirmRaw ? parseFlexibleDate(confirmRaw) : null;
    const status = STATUS_ALIASES[norm(row.status ?? "")] ?? (confirmDate ? "CONFIRMED" : "PROBATION");
    const deptName = (row.department ?? "").trim();

    const input = {
      name: row.name.trim(),
      email,
      empCode: (row.empcode ?? "").trim() || undefined,
      designation: (row.designation ?? "").trim(),
      role: (ROLE_ALIASES[norm(row.role ?? "")] ?? "EMPLOYEE") as Role,
      gender: GENDER_ALIASES[norm(row.gender ?? "")] ?? "UNSPECIFIED",
      employmentType: TYPE_ALIASES[norm(row.employmenttype ?? "")] ?? "FULL_TIME",
      status,
      joinDate,
      confirmDate,
      departmentId: deptName ? deptByName.get(norm(deptName))?.id ?? null : null,
      managerId: null, // second pass
      phone: (row.phone ?? "").trim(),
      location: (row.location ?? "").trim(),
    };

    const opening: Partial<Record<LeaveType, number>> = {};
    for (const [col, type] of [
      ["openingcl", "CL"], ["openingsl", "SL"], ["openingpl", "PL"], ["openingcompoff", "COMP_OFF"],
    ] as const) {
      const v = parseOptionalNumber(row[col] ?? "");
      if (v !== null && !Number.isNaN(v) && v !== 0) opening[type as LeaveType] = v;
    }

    try {
      if (verdict.action === "CREATE") {
        const res = await createEmployee(input, actor, { openingBalances: opening, silent: true });
        if (res.ok) created++;
        else errors.push(`Line ${row.__line} (${email}): ${res.error}`);
      } else {
        const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
        if (!existing) { errors.push(`Line ${row.__line}: ${email} vanished mid-import.`); continue; }
        const res = await updateEmployee(existing.id, input, actor);
        if (res.ok) {
          updated++;
          if (Object.keys(opening).length > 0) {
            await postOpeningBalances(existing.id, opening, actor.id);
          }
        } else errors.push(`Line ${row.__line} (${email}): ${res.error}`);
      }
    } catch (e) {
      errors.push(`Line ${row.__line} (${email}): ${e instanceof Error ? e.message : "unexpected error"}`);
    }
  }

  // Pass 2 — manager links, now that everyone exists.
  for (const row of toApply) {
    const managerEmail = (row.manageremail ?? "").trim().toLowerCase();
    if (!managerEmail) continue;
    const email = row.email.trim().toLowerCase();
    const [person, manager] = await Promise.all([
      db.user.findUnique({ where: { email }, select: { id: true } }),
      db.user.findUnique({ where: { email: managerEmail }, select: { id: true } }),
    ]);
    if (!person || !manager || person.id === manager.id) continue;
    await db.user.update({ where: { id: person.id }, data: { managerId: manager.id } });
  }

  await audit({
    actorId: actor.id,
    action: "EMPLOYEES_IMPORTED",
    entity: "User",
    summary: `Imported employees from CSV — ${created} created, ${updated} updated, ${skipped} skipped, ${departments} departments created`,
    meta: { created, updated, skipped, departments, errors: errors.length },
  });

  return { created, updated, skipped, departments, errors };
}

export { BALANCE_TYPES, EMPLOYMENT_TYPE_LABEL, ROLES, todayKey };
