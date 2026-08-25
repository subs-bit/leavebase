"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight, Loader2 } from "lucide-react";
import { completeSetupAction, type SetupState } from "./actions";
import { PolicyNote } from "@/components/ui/primitives";
import { todayKey } from "@/lib/date";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary w-full py-3">
      {pending ? (
        <>
          <Loader2 size={15} className="animate-spin" /> Setting up…
        </>
      ) : (
        <>
          Create administrator and continue <ArrowRight size={15} strokeWidth={2.6} />
        </>
      )}
    </button>
  );
}

export function SetupForm() {
  const [state, action] = useActionState<SetupState, FormData>(completeSetupAction, {});

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">Your full name</label>
          <input id="name" name="name" required autoFocus className="field" placeholder="Vatsal Sheth" />
        </div>
        <div>
          <label className="label" htmlFor="designation">Your designation</label>
          <input id="designation" name="designation" className="field" placeholder="Co-Founder & CEO" />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="email">Work email</label>
        <input
          id="email" name="email" type="email" required className="field"
          placeholder="you@prismixstudios.com"
        />
        <p className="mt-1.5 text-[11px]" style={{ color: "var(--c-ink-400)" }}>
          This is how you&rsquo;ll sign in.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input
            id="password" name="password" type="password" required minLength={8}
            autoComplete="new-password" className="field"
          />
        </div>
        <div>
          <label className="label" htmlFor="confirm">Confirm password</label>
          <input
            id="confirm" name="confirm" type="password" required minLength={8}
            autoComplete="new-password" className="field"
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="joinDate">Your joining date</label>
        <input
          id="joinDate" name="joinDate" type="date" required
          defaultValue={todayKey()} className="field"
        />
        <p className="mt-1.5 text-[11px]" style={{ color: "var(--c-ink-400)" }}>
          Leave accrues pro-rata from this date (§7).
        </p>
      </div>

      <div>
        <label className="label" htmlFor="departments">
          Departments <span style={{ color: "var(--c-ink-400)", fontWeight: 500 }}>(optional)</span>
        </label>
        <textarea
          id="departments" name="departments" rows={3} className="field resize-none"
          placeholder={"Production, Post-Production, Creative, Technology, Business Affairs"}
        />
        <p className="mt-1.5 text-[11px]" style={{ color: "var(--c-ink-400)" }}>
          Comma or line separated. You can add, rename and assign heads later.
        </p>
      </div>

      {state.error && <PolicyNote level="BLOCK" title={state.error} />}

      <Submit />

      <p className="text-center text-[11px] leading-relaxed" style={{ color: "var(--c-ink-400)" }}>
        The leave policy loads with the Prismix Studios defaults — 6 casual, 6 sick, 15 privileged,
        financial-year accrual. You can change every value in Settings afterwards.
      </p>
    </form>
  );
}
