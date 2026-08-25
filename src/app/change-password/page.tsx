import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { LeaveBaseLogo } from "@/components/ui/Logo";
import { FirstPasswordForm } from "./FirstPasswordForm";

export const metadata = { title: "Choose a password" };

export default async function ChangePasswordPage() {
  const user = await requireUser();
  // Nothing to do here if they already own their password.
  if (!user.mustChangePassword) redirect("/profile");

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -left-[16%] -top-[20%] h-[520px] w-[520px] rounded-full opacity-[0.24] blur-[110px]"
          style={{ background: "radial-gradient(circle, #2FD3F0, transparent 68%)" }}
        />
        <div
          className="absolute -bottom-[24%] -right-[12%] h-[560px] w-[560px] rounded-full opacity-[0.26] blur-[120px]"
          style={{ background: "radial-gradient(circle, #C062D9, transparent 68%)" }}
        />
      </div>

      <div className="relative z-10 w-full max-w-[440px]">
        <div className="mb-7 flex justify-center">
          <LeaveBaseLogo size={36} />
        </div>

        <div className="card animate-in p-7" style={{ boxShadow: "var(--sh-lift)" }}>
          <h1 className="text-[22px]">Welcome, {user.name.split(" ")[0]}</h1>
          <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: "var(--c-ink-500)" }}>
            You signed in with a temporary password. Choose one only you know before you carry on —
            your leave record and your team&rsquo;s sit behind it.
          </p>
          <div className="mt-6">
            <FirstPasswordForm />
          </div>
        </div>

        <form action="/api/logout" method="post" className="mt-5 text-center">
          <button type="submit" className="text-[12px] font-bold" style={{ color: "var(--c-ink-400)" }}>
            Sign out instead
          </button>
        </form>
      </div>
    </main>
  );
}
