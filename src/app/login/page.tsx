import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PrismixMark } from "@/components/ui/Logo";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };

// Must never be prerendered: this page asks the database whether any account exists, and a
// build-time answer would be frozen forever — sending everyone to /setup on a live instance, or
// hiding /setup on a brand-new one.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // A brand-new instance has nobody to sign in as — send them to first-run setup.
  if ((await db.user.count()) === 0) redirect("/setup");

  const user = await getSessionUser();
  if (user) redirect("/");

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-10">
      {/* The prism aura — the one saturated gradient this screen is allowed. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -left-[18%] -top-[22%] h-[560px] w-[560px] rounded-full opacity-[0.28] blur-[110px]"
          style={{ background: "radial-gradient(circle, #2FD3F0, transparent 68%)" }}
        />
        <div
          className="absolute -bottom-[26%] -right-[14%] h-[620px] w-[620px] rounded-full opacity-[0.3] blur-[120px]"
          style={{ background: "radial-gradient(circle, #C062D9, transparent 68%)" }}
        />
        <div
          className="absolute left-[38%] top-[24%] h-[420px] w-[420px] rounded-full opacity-[0.22] blur-[110px]"
          style={{ background: "radial-gradient(circle, #6C4BF6, transparent 68%)" }}
        />
      </div>

      <div className="relative z-10 w-full max-w-[420px]">
        <div className="mb-8 flex flex-col items-center text-center">
          {/*
            The lockup PNG is a colour-gradient ring plus black wordmark on transparent — there is
            no filter that makes that legible in dark mode (brightness-0 + invert previously
            flattened the whole thing into a solid white blob, losing the ring entirely). The mark
            is drawn as SVG instead, which already carries its own colours in both themes, and the
            wordmark is real text so it can follow the ink token like everything else on the page.
          */}
          <PrismixMark size={72} id="login" />
          <p
            className="mt-4 text-[20px] font-extrabold uppercase tracking-[0.12em]"
            style={{ color: "var(--c-ink-900)" }}
          >
            Prismix
          </p>
          <p
            className="-mt-1 text-[11px] font-bold uppercase tracking-[0.3em]"
            style={{ color: "var(--c-ink-500)" }}
          >
            Studios
          </p>
          <p
            className="mt-1 text-[9px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: "var(--c-ink-400)" }}
          >
            Entertainment Redefined
          </p>
          <h1 className="mt-6 text-[28px] tracking-[-0.03em]">
            Leave<span className="text-gradient">Base</span>
          </h1>
          <p className="mt-1.5 text-[13.5px]" style={{ color: "var(--c-ink-500)" }}>
            Leave management for Prismix Studios
          </p>
        </div>

        <div className="card animate-in p-7" style={{ boxShadow: "var(--sh-lift)" }}>
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-[11.5px]" style={{ color: "var(--c-ink-400)" }}>
          Governed by the Prismix Studios Leave Policy, effective 1 July 2026.
        </p>
      </div>
    </main>
  );
}
