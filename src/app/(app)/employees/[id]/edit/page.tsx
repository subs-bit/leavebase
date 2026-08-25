import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireHr } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageBody, PageHeader } from "@/components/PageHeader";
import { PersonForm } from "../../PersonForm";
import { AccountControls } from "./AccountControls";
import { dayKey } from "@/lib/date";

export const metadata = { title: "Edit employee" };

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireHr();

  const [emp, departments, managers] = await Promise.all([
    db.user.findUnique({ where: { id } }),
    db.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.user.findMany({
      where: { isActive: true, id: { not: id } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, designation: true },
    }),
  ]);
  if (!emp) notFound();

  return (
    <>
      <PageHeader
        title={`Edit ${emp.name}`}
        subtitle={`${emp.empCode} · changes are written to the audit log`}
        actions={
          <Link href={`/employees/${id}`} className="btn btn-ghost hidden sm:inline-flex">
            <ArrowLeft size={15} />
            Back to record
          </Link>
        }
      />
      <PageBody>
        <div className="mx-auto max-w-[860px] space-y-5">
          <PersonForm
            mode="edit"
            initial={{
              id: emp.id,
              name: emp.name,
              email: emp.email,
              empCode: emp.empCode,
              designation: emp.designation,
              role: emp.role,
              gender: emp.gender,
              employmentType: emp.employmentType,
              status: emp.status,
              joinDate: dayKey(emp.joinDate),
              confirmDate: emp.confirmDate ? dayKey(emp.confirmDate) : "",
              departmentId: emp.departmentId ?? "",
              managerId: emp.managerId ?? "",
              phone: emp.phone,
              location: emp.location,
            }}
            departments={departments.map((d) => ({ id: d.id, label: d.name }))}
            managers={managers.map((m) => ({ id: m.id, label: m.name, sub: m.designation }))}
            canAssignPrivileged={actor.role === "ADMIN"}
          />

          <AccountControls
            userId={emp.id}
            name={emp.name}
            isActive={emp.isActive}
            isSelf={emp.id === actor.id}
            mustChangePassword={emp.mustChangePassword}
            lastLoginAt={emp.lastLoginAt ? emp.lastLoginAt.toISOString() : null}
          />
        </div>
      </PageBody>
    </>
  );
}
