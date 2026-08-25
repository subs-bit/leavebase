import { redirect } from "next/navigation";
import { LeaveBaseLogo } from "@/components/ui/Logo";
import { isUnclaimed } from "./actions";
import { SetupForm } from "./SetupForm";

export const metadata = { title: "Set up LeaveBase" };

// Must never be prerendered: whether this instance has an account is a runtime fact, and baking it
// in at build time would either lock setup shut or leave it open forever.
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (!(await isUnclaimed())) redirect("/login");

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-12">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -left-[18%] -top-[22%] h-[560px] w-[560px] rounded-full opacity-[0.26] blur-[110px]"
          style={{ background: "radial-gradient(circle, #2FD3F0, transparent 68%)" }}
        />
        <div
          className="absolute -bottom-[26%] -right-[14%] h-[620px] w-[620px] rounded-full opacity-[0.28] blur-[120px]"
          style={{ background: "radial-gradient(circle, #C062D9, transparent 68%)" }}
        />
      </div>

      <div className="relative z-10 w-full max-w-[560px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <LeaveBaseLogo size={40} />
          <h1 className="mt-6 text-[26px] tracking-[-0.03em]">Set up LeaveBase</h1>
          <p className="mt-2 max-w-sm text-[13.5px] leading-relaxed" style={{ color: "var(--c-ink-500)" }}>
            This instance has no accounts yet. Create the first administrator — you&rsquo;ll be able
            to add everyone else, or import them from a spreadsheet, straight afterwards.
          </p>
        </div>

        <div className="card animate-in p-7" style={{ boxShadow: "var(--sh-lift)" }}>
          <SetupForm />
        </div>

        <p className="mt-6 text-center text-[11.5px]" style={{ color: "var(--c-ink-400)" }}>
          This page stops working the moment the first account exists.
        </p>
      </div>
    </main>
  );
}
