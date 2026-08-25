import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Suspense } from "react";
import { MobileNav, Sidebar } from "@/components/Sidebar";
import { NavProgress } from "@/components/NavProgress";
import { canApprove as roleCanApprove, isHrOrAdmin } from "@/lib/policy/types";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // A temporary password gets changed before anything else is reachable.
  if (user.mustChangePassword) redirect("/change-password");
  const approver = roleCanApprove(user.role);

  const pendingCount = approver
    ? await db.approval.count({
        where: {
          approverId: user.id,
          action: "PENDING",
          request: { status: { in: ["PENDING", "PENDING_HOD"] } },
        },
      })
    : 0;

  return (
    <div className="flex min-h-screen">
      {/* useSearchParams needs a Suspense boundary during prerender */}
      <Suspense fallback={null}>
        <NavProgress />
      </Suspense>
      <Sidebar
        user={{
          id: user.id,
          name: user.name,
          role: user.role,
          designation: user.designation,
          avatarHue: user.avatarHue,
          empCode: user.empCode,
        }}
        pendingCount={pendingCount}
        canApprove={approver}
        isHr={isHrOrAdmin(user.role)}
        isAdmin={user.role === "ADMIN"}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {children}
        <div className="h-20 lg:hidden" />
      </div>
      <MobileNav canApprove={approver} pendingCount={pendingCount} />
    </div>
  );
}
