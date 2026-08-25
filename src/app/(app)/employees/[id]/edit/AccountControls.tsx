"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Copy, KeyRound, Loader2, UserMinus, UserPlus } from "lucide-react";
import { resetPasswordAction, setActiveAction, type PeopleState } from "../../actions";
import { PolicyNote, SectionHeader } from "@/components/ui/primitives";
import { timeAgo } from "@/lib/date";

function Pending({ label, tone }: { label: string; tone: "ghost" | "danger" | "primary" }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`btn ${tone === "danger" ? "btn-danger" : tone === "primary" ? "btn-primary" : "btn-ghost"}`}
    >
      {pending && <Loader2 size={14} className="animate-spin" />}
      {label}
    </button>
  );
}

function TempPassword({ password }: { password: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3 flex items-center gap-2">
      <code
        className="flex-1 rounded-xl px-3.5 py-2.5 text-[16px] font-extrabold tracking-wide"
        style={{ background: "var(--c-surface)", color: "var(--c-ink-900)" }}
      >
        {password}
      </code>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText(password);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        }}
        className="btn btn-ghost shrink-0"
        style={{ padding: "10px 14px" }}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function AccountControls({
  userId, name, isActive, isSelf, mustChangePassword, lastLoginAt,
}: {
  userId: string;
  name: string;
  isActive: boolean;
  isSelf: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
}) {
  const [pwState, pwAction] = useActionState<PeopleState, FormData>(resetPasswordAction, {});
  const [actState, actAction] = useActionState<PeopleState, FormData>(setActiveAction, {});
  const [confirming, setConfirming] = useState(false);

  return (
    <section className="card p-5 sm:p-6">
      <SectionHeader eyebrow="Account" title="Access" />

      <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2">
        <div>
          <dt className="eyebrow mb-0.5">Status</dt>
          <dd className="text-[12.5px] font-bold" style={{ color: isActive ? "var(--c-success-ink)" : "var(--c-ink-400)" }}>
            {isActive ? "Active" : "Deactivated"}
          </dd>
        </div>
        <div>
          <dt className="eyebrow mb-0.5">Last signed in</dt>
          <dd className="text-[12.5px] font-bold" style={{ color: "var(--c-ink-900)" }}>
            {lastLoginAt ? timeAgo(lastLoginAt) : "Never"}
          </dd>
        </div>
        <div>
          <dt className="eyebrow mb-0.5">Password</dt>
          <dd className="text-[12.5px] font-bold" style={{ color: "var(--c-ink-900)" }}>
            {mustChangePassword ? "Temporary — not yet changed" : "Set by the employee"}
          </dd>
        </div>
      </dl>

      {/* password reset */}
      <div className="mt-5 border-t pt-5" style={{ borderColor: "var(--c-border)" }}>
        <form action={pwAction}>
          <input type="hidden" name="userId" value={userId} />
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold" style={{ color: "var(--c-ink-900)" }}>
                Issue a temporary password
              </p>
              <p className="mt-0.5 text-[11.5px]" style={{ color: "var(--c-ink-500)" }}>
                Signs {name.split(" ")[0]} out everywhere and forces a new password at next sign-in.
              </p>
            </div>
            <Pending label="Reset password" tone="ghost" />
          </div>
        </form>
        {pwState.error && <div className="mt-3"><PolicyNote level="BLOCK" title={pwState.error} /></div>}
        {pwState.tempPassword && (
          <div
            className="mt-3 rounded-2xl p-4"
            style={{
              background: "var(--c-success-tint)",
              border: "1px solid color-mix(in srgb, var(--c-success) 30%, transparent)",
            }}
          >
            <p className="flex items-center gap-2 text-[12.5px] font-bold" style={{ color: "var(--c-success-ink)" }}>
              <KeyRound size={14} />
              Shown once — copy it now
            </p>
            <TempPassword password={pwState.tempPassword} />
          </div>
        )}
      </div>

      {/* deactivate / reactivate */}
      {!isSelf && (
        <div className="mt-5 border-t pt-5" style={{ borderColor: "var(--c-border)" }}>
          {!confirming ? (
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold" style={{ color: "var(--c-ink-900)" }}>
                  {isActive ? "Deactivate this account" : "Reactivate this account"}
                </p>
                <p className="mt-0.5 text-[11.5px]" style={{ color: "var(--c-ink-500)" }}>
                  {isActive
                    ? "They lose access immediately. Leave history, balances and the audit trail are kept — nothing is deleted."
                    : "They can sign in again with their existing password."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className={`btn ${isActive ? "btn-danger" : "btn-primary"}`}
              >
                {isActive ? <UserMinus size={14} /> : <UserPlus size={14} />}
                {isActive ? "Deactivate" : "Reactivate"}
              </button>
            </div>
          ) : (
            <form action={actAction} className="space-y-3">
              <input type="hidden" name="userId" value={userId} />
              <input type="hidden" name="active" value={isActive ? "false" : "true"} />
              <div>
                <label className="label" htmlFor="deact-reason">
                  {isActive ? "Why is this account being deactivated?" : "Why is it being reactivated?"}
                </label>
                <input
                  id="deact-reason"
                  name="reason"
                  required
                  className="field"
                  placeholder={isActive ? "e.g. Left the company on 30 Sep." : "e.g. Returned from sabbatical."}
                />
              </div>
              <div className="flex gap-2.5">
                <button type="button" onClick={() => setConfirming(false)} className="btn btn-ghost">
                  Cancel
                </button>
                <Pending
                  label={isActive ? `Deactivate ${name.split(" ")[0]}` : `Reactivate ${name.split(" ")[0]}`}
                  tone={isActive ? "danger" : "primary"}
                />
              </div>
            </form>
          )}
          {actState.error && <div className="mt-3"><PolicyNote level="BLOCK" title={actState.error} /></div>}
          {actState.ok && <div className="mt-3"><PolicyNote level="INFO" title={actState.ok} /></div>}
        </div>
      )}
    </section>
  );
}
