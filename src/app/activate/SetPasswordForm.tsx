"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { setPasswordViaTokenAction, type SetPasswordState } from "./actions";
import { PolicyNote } from "@/components/ui/primitives";
import type { LoginTokenPurpose } from "@/lib/auth";

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={disabled || pending} className="btn btn-primary w-full py-3">
      {pending ? (
        <>
          <Loader2 size={15} className="animate-spin" /> Saving…
        </>
      ) : (
        <>
          Set password and continue <ArrowRight size={15} strokeWidth={2.6} />
        </>
      )}
    </button>
  );
}

export function SetPasswordForm({ token, purpose }: { token: string; purpose: LoginTokenPurpose }) {
  const [state, action] = useActionState<SetPasswordState, FormData>(setPasswordViaTokenAction, {});
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const rules = [
    { label: "At least 8 characters", ok: next.length >= 8 },
    { label: "Not only numbers", ok: next.length > 0 && !/^\d+$/.test(next) },
    { label: "Both entries match", ok: next.length > 0 && next === confirm },
  ];
  const ready = rules.every((r) => r.ok);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="purpose" value={purpose} />
      <div>
        <label className="label" htmlFor="next">New password</label>
        <input
          id="next"
          name="next"
          type="password"
          autoComplete="new-password"
          required
          autoFocus
          value={next}
          onChange={(e) => setNext(e.target.value)}
          className="field"
        />
      </div>
      <div>
        <label className="label" htmlFor="confirm">Type it again</label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="field"
        />
      </div>

      <ul className="space-y-1.5">
        {rules.map((r) => (
          <li key={r.label} className="flex items-center gap-2">
            <span
              className="flex h-4 w-4 items-center justify-center rounded-full transition-colors"
              style={{
                background: r.ok ? "var(--c-success)" : "var(--c-ink-100)",
                color: "#fff",
              }}
            >
              {r.ok && <Check size={10} strokeWidth={3.5} />}
            </span>
            <span
              className="text-[12px] font-semibold"
              style={{ color: r.ok ? "var(--c-success-ink)" : "var(--c-ink-400)" }}
            >
              {r.label}
            </span>
          </li>
        ))}
      </ul>

      {state.error && <PolicyNote level="BLOCK" title={state.error} />}

      <Submit disabled={!ready} />
    </form>
  );
}
