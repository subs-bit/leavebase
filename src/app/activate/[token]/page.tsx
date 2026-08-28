import Link from "next/link";
import { peekLoginToken } from "@/lib/auth";
import { LeaveBaseLogo } from "@/components/ui/Logo";
import { SetPasswordForm } from "../SetPasswordForm";

export const metadata = { title: "Activate your account" };
export const dynamic = "force-dynamic";

export default async function ActivatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const check = await peekLoginToken(token, "ACTIVATE");

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
          {check.ok ? (
            <>
              <h1 className="text-[22px]">Welcome, {check.name.split(" ")[0]}</h1>
              <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: "var(--c-ink-500)" }}>
                One step to activate <strong>{check.email}</strong> — set a password only you know.
              </p>
              <div className="mt-6">
                <SetPasswordForm token={token} purpose="ACTIVATE" />
              </div>
            </>
          ) : (
            <>
              <h1 className="text-[22px]">Link no longer valid</h1>
              <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: "var(--c-ink-500)" }}>
                {check.error}
              </p>
              <Link href="/login" className="btn btn-ghost mt-6 w-full">
                Go to sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
