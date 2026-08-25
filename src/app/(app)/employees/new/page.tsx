import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireHr } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageBody, PageHeader } from "@/components/PageHeader";
import { PersonForm } from "../PersonForm";

export const metadata = { title: "Add an employee" };

export default async function NewEmployeePage() {
  const actor = await requireHr();

  const [departments, managers] = await Promise.all([
    db.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.user.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, designation: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Add an employee"
        subtitle="They'll get a temporary password to change at first sign-in."
        actions={
          <Link href="/employees" className="btn btn-ghost hidden sm:inline-flex">
            <ArrowLeft size={15} />
            Back
          </Link>
        }
      />
      <PageBody>
        <div className="mx-auto max-w-[860px]">
          <PersonForm
            mode="create"
            departments={departments.map((d) => ({ id: d.id, label: d.name }))}
            managers={managers.map((m) => ({ id: m.id, label: m.name, sub: m.designation }))}
            canAssignPrivileged={actor.role === "ADMIN"}
          />
        </div>
      </PageBody>
    </>
  );
}
