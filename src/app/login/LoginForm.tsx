"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight, Eye, EyeOff, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { loginAction, type LoginState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary mt-1 w-full py-3">
      {pending ? "Signing in…" : "Sign in"}
      {!pending && <ArrowRight size={15} strokeWidth={2.6} />}
    </button>
  );
}

export function LoginForm() {
  const [state, action] = useActionState<LoginState, FormData>(loginAction, {});
  const [show, setShow] = useState(false);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">Work email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          placeholder="you@prismixstudios.com"
          className="field"
        />
      </div>

      <div>
        <label className="label" htmlFor="password">Password</label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            required
            placeholder="••••••••"
            className="field pr-11"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1"
            style={{ color: "var(--c-ink-400)" }}
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      {state.error && (
        <div
          className="policy-note flex items-start gap-2.5"
          style={{
            background: "var(--c-danger-tint)",
            borderColor: "color-mix(in srgb, var(--c-danger) 26%, transparent)",
          }}
        >
          <TriangleAlert size={15} style={{ color: "var(--c-danger-ink)", marginTop: 1 }} />
          <p style={{ color: "var(--c-danger-ink)" }} className="font-semibold">{state.error}</p>
        </div>
      )}

      <SubmitButton />
    </form>
  );
}
