"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { changePasswordAction, updateProfileAction, type ProfileState } from "./actions";
import { PolicyNote } from "@/components/ui/primitives";

function Save({ label = "Save" }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary">
      {pending && <Loader2 size={14} className="animate-spin" />}
      {label}
    </button>
  );
}

function Result({ state }: { state: ProfileState }) {
  if (state.error) return <PolicyNote level="BLOCK" title={state.error} />;
  if (state.ok) return <PolicyNote level="INFO" title={state.ok} />;
  return null;
}

export function ContactForm({ phone, location }: { phone: string; location: string }) {
  const [state, action] = useActionState<ProfileState, FormData>(updateProfileAction, {});
  return (
    <form action={action} className="space-y-3.5">
      <div className="grid gap-3.5 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="phone">Phone</label>
          <input id="phone" name="phone" defaultValue={phone} className="field" placeholder="+91 …" />
        </div>
        <div>
          <label className="label" htmlFor="location">Location</label>
          <input id="location" name="location" defaultValue={location} className="field" />
        </div>
      </div>
      <Result state={state} />
      <Save />
      <p className="text-[11px]" style={{ color: "var(--c-ink-400)" }}>
        Name, designation, department and reporting manager are maintained by HR.
      </p>
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState<ProfileState, FormData>(changePasswordAction, {});
  return (
    <form action={action} className="space-y-3.5">
      <div>
        <label className="label" htmlFor="current">Current password</label>
        <input id="current" name="current" type="password" autoComplete="current-password" required className="field" />
      </div>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="next">New password</label>
          <input id="next" name="next" type="password" autoComplete="new-password" required minLength={8} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="confirm">Confirm it</label>
          <input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} className="field" />
        </div>
      </div>
      <Result state={state} />
      <Save label="Change password" />
    </form>
  );
}
