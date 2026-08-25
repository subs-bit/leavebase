import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { dayKey, fmtDate, todayKey } from "@/lib/date";
import { getBalances, getPolicy } from "@/lib/services/context";
import { leaveYearOf } from "@/lib/policy/leave-year";
import { isHrOrAdmin, leaveNameOf } from "@/lib/policy/export-helpers";
import { importTemplateCsv } from "@/lib/services/import";

function csv(rows: (string | number)[][]): string {
  return rows
    .map((r) =>
      r
        .map((cell) => {
          const s = String(cell ?? "");
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\r\n");
}

function send(name: string, body: string) {
  return new NextResponse(`﻿${body}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;
  const user = await getSessionUser();
  if (!user || !isHrOrAdmin(user.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  // The import template needs no data, so it is served before the heavier lookups.
  if (file === "template.csv") {
    return send("leavebase-employee-import-template.csv", importTemplateCsv());
  }

  const cfg = await getPolicy();
  const today = todayKey();
  const ly = leaveYearOf(today, cfg);
  const stamp = `${ly.label}-as-of-${today}`;

  if (file === "leave.csv") {
    const requests = await db.leaveRequest.findMany({
      include: {
        user: {
          select: {
            name: true, empCode: true, email: true,
            department: { select: { name: true } },
          },
        },
        approvals: {
          orderBy: { level: "asc" },
          include: { approver: { select: { name: true } } },
        },
      },
      orderBy: { startDate: "desc" },
    });

    const rows: (string | number)[][] = [
      [
        "Request code", "Employee code", "Employee", "Department", "Leave type",
        "Start", "End", "Half day", "Days charged", "LOP days", "Status",
        "Applied on", "Notice days", "Decided on", "Approvers", "Reason",
      ],
      ...requests.map((r) => [
        r.code,
        r.user.empCode,
        r.user.name,
        r.user.department?.name ?? "",
        leaveNameOf(r.leaveType),
        dayKey(r.startDate),
        dayKey(r.endDate),
        r.halfDay === "NONE" ? "" : r.halfDay,
        r.chargedDays,
        r.lopDays,
        r.status,
        dayKey(r.appliedAt),
        r.noticeDays,
        r.decidedAt ? dayKey(r.decidedAt) : "",
        r.approvals.map((a) => `${a.approver.name} (${a.levelLabel}: ${a.action})`).join(" | "),
        r.reason,
      ]),
    ];
    return send(`leavebase-requests-${stamp}.csv`, csv(rows));
  }

  if (file === "lop.csv") {
    const requests = await db.leaveRequest.findMany({
      where: { lopDays: { gt: 0 } },
      include: {
        user: { select: { name: true, empCode: true, department: { select: { name: true } } } },
      },
      orderBy: { startDate: "desc" },
    });
    const rows: (string | number)[][] = [
      ["Request code", "Employee code", "Employee", "Department", "Leave type", "Start", "End", "Unpaid days", "Status", "Reason"],
      ...requests.map((r) => [
        r.code, r.user.empCode, r.user.name, r.user.department?.name ?? "",
        leaveNameOf(r.leaveType), dayKey(r.startDate), dayKey(r.endDate),
        r.lopDays, r.status, r.reason,
      ]),
    ];
    return send(`leavebase-lop-register-${stamp}.csv`, csv(rows));
  }

  if (file === "balances.csv") {
    const employees = await db.user.findMany({
      where: { isActive: true },
      include: { department: { select: { name: true } } },
      orderBy: { name: "asc" },
    });

    const rows: (string | number)[][] = [
      [
        "Employee code", "Employee", "Department", "Designation", "Status", "Joined", "Confirmed",
        "CL available", "CL used", "SL available", "SL used", "PL available", "PL used", "Comp-off available",
      ],
    ];
    for (const e of employees) {
      const b = await getBalances(e.id, cfg, ly, today);
      const g = (t: string) => b.find((x) => x.leaveType === t);
      rows.push([
        e.empCode, e.name, e.department?.name ?? "", e.designation, e.status,
        dayKey(e.joinDate), e.confirmDate ? dayKey(e.confirmDate) : "",
        g("CL")?.available ?? 0, g("CL")?.used ?? 0,
        g("SL")?.available ?? 0, g("SL")?.used ?? 0,
        g("PL")?.available ?? 0, g("PL")?.used ?? 0,
        g("COMP_OFF")?.available ?? 0,
      ]);
    }
    return send(`leavebase-balances-${stamp}.csv`, csv(rows));
  }

  if (file === "audit.csv") {
    const logs = await db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 5000 });
    const rows: (string | number)[][] = [
      ["Timestamp", "Actor", "Action", "Entity", "Entity id", "Summary"],
      ...logs.map((l) => [
        l.createdAt.toISOString(), l.actorName, l.action, l.entity, l.entityId, l.summary,
      ]),
    ];
    return send(`leavebase-audit-${stamp}.csv`, csv(rows));
  }

  return NextResponse.json({ error: "Unknown export" }, { status: 404 });
}
