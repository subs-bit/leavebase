"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound, Loader2 } from "lucide-react";
import { createPersonAction, updatePersonAction, type PeopleState } from "./actions";
import { PolicyNote, SectionHeader } from "@/components/ui/primitives";
import { todayKey } from "@/lib/date";
import {
  BALANCE_TYPES, EMPLOYMENT_STATUS_LABEL, EMPLOYMENT_TYPE_LABEL, LEAVE_META, ROLE_LABEL, ROLES,
} from "@/lib/policy/types";
import type { Role } from "@/lib/policy/types";

export type PersonFormValues = {
  id?: string;
  name: string;
  email: string;
  empCode: string;
  designation: string;
  role: string;
  gender: string;
  employmentType: string;
  status: string;
  joinDate: string;
  confirmDate: string;
  departmentId: string;
  managerId: string;
  phone: string;
  location: string;
};

export type Option = { id: string; label: string; sub?: string };

const EMPTY: PersonFormValues = {
  name: "", email: "", empCode: "", designation: "", role: "EMPLOYEE",
  gender: "UNSPECIFIED", employmentType: "FULL_TIME", status: "PROBATION",
  joinDate: "", confirmDate: "", departmentId: "", managerId: "", phone: "", location: "Mumbai",
};

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary">
      {pending && <Loader2 size={14} className="animate-spin" />}
      {label}
    </button>
  );
}

/** The temp password is shown exactly once — there is no way to read it back. */
function TempPassword({ password }: { password: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: "var(--c-success-tint)", border: "1px solid color-mix(in srgb, var(--c-success) 30%, transparent)" }}
    >
      <p className="flex items-center gap-2 text-[12.5px] font-bold" style={{ color: "var(--c-success-ink)" }}>
        <KeyRound size={14} />
        Temporary password
      </p>
      <div className="mt-2.5 flex items-center gap-2">
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
      <p className="mt-2.5 text-[11.5px] leading-snug" style={{ color: "var(--c-ink-700)" }}>
        Hand this over in person or on a channel you trust. It is shown once and cannot be read
        back — if it&rsquo;s lost, issue a new one from their record. They must change it the
        moment they sign in.
      </p>
    </div>
  );
}

export function PersonForm({
  mode,
  initial,
  departments,
  managers,
  canAssignPrivileged,
  actorRole,
}: {
  mode: "create" | "edit";
  initial?: PersonFormValues;
  departments: Option[];
  managers: Option[];
  canAssignPrivileged: boolean;
  actorRole: string;
}) {
  const router = useRouter();
  const [state, action] = useActionState<PeopleState, FormData>(
    mode === "create" ? createPersonAction : updatePersonAction,
    {},
  );
  const v = initial ?? EMPTY;
  const [status, setStatus] = useState(v.status);
  const [role, setRole] = useState(v.role);

  // Only a founder can create another founder; only an admin or founder can grant HR/Admin.
  const roleOptions = (ROLES as readonly string[]).filter((r) => {
    if (r === v.role) return true;
    if (r === "FOUNDER") return actorRole === "FOUNDER";
    if (r === "ADMIN" || r === "HR") return canAssignPrivileged;
    return true;
  });

  // A fresh joiner mid-year almost always carries balances across, so the section is only
  // offered at creation — afterwards, corrections belong in the ledger as adjustments.
  const showOpening = mode === "create" && role !== "FOUNDER";

  return (
    <form action={action} className="space-y-5">
      {mode === "edit" && <input type="hidden" name="userId" value={v.id} />}

      <section className="card p-5 sm:p-6">
        <SectionHeader eyebrow="Step 1" title="Who they are" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="name">
            <input id="name" name="name" required defaultValue={v.name} className="field" placeholder="Priya Raman" />
          </Field>
          <Field label="Work email" htmlFor="email" hint="This is how they sign in.">
            <input id="email" name="email" type="email" required defaultValue={v.email} className="field" placeholder="priya.raman@prismixstudios.com" />
          </Field>
          <Field label="Designation" htmlFor="designation">
            <input id="designation" name="designation" defaultValue={v.designation} className="field" placeholder="Senior Editor" />
          </Field>
          <Field label="Employee code" htmlFor="empCode" hint={mode === "create" ? "Leave blank to assign the next one." : undefined}>
            <input id="empCode" name="empCode" defaultValue={v.empCode} className="field" placeholder="PRX027" />
          </Field>
          <Field label="Phone" htmlFor="phone">
            <input id="phone" name="phone" defaultValue={v.phone} className="field" placeholder="+91 …" />
          </Field>
          <Field label="Location" htmlFor="location">
            <input id="location" name="location" defaultValue={v.location} className="field" />
          </Field>
          <Field
            label="Gender"
            htmlFor="gender"
            hint="Determines eligibility for maternity and paternity leave (§9, §10)."
          >
            <select id="gender" name="gender" defaultValue={v.gender} className="field">
              <option value="UNSPECIFIED">Not specified</option>
              <option value="FEMALE">Female</option>
              <option value="MALE">Male</option>
              <option value="OTHER">Other</option>
            </select>
          </Field>
          <Field label="Employment type" htmlFor="employmentType">
            <select id="employmentType" name="employmentType" defaultValue={v.employmentType} className="field">
              {Object.entries(EMPLOYMENT_TYPE_LABEL).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <section className="card p-5 sm:p-6">
        <SectionHeader eyebrow="Step 2" title="Where they sit" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Department" htmlFor="departmentId">
            <select id="departmentId" name="departmentId" defaultValue={v.departmentId} className="field">
              <option value="">No department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          </Field>
          <Field
            label="Reporting manager"
            htmlFor="managerId"
            hint="Their leave requests go here first (§15)."
          >
            <select id="managerId" name="managerId" defaultValue={v.managerId} className="field">
              <option value="">No manager — leave goes to HR</option>
              {managers.filter((m) => m.id !== v.id).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}{m.sub ? ` — ${m.sub}` : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Role in LeaveBase"
            htmlFor="role"
            hint={
              role === "MANAGER" ? "Gets an approval inbox for their direct reports."
              : role === "HOD" ? "Second-level approver for long Privileged Leave (§6)."
              : role === "HR" ? "Full employee directory, reports, balance adjustments."
              : role === "ADMIN" ? "Everything, including policy settings and the audit log."
              : role === "FOUNDER" ? "Above the policy: sees and changes everything, accrues no leave, and never appears in leave reporting."
              : "Can apply for their own leave only."
            }
          >
            <select
              id="role"
              name="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="field"
            >
              {roleOptions.map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r as Role]}</option>
              ))}
            </select>
          </Field>
          <Field label="Employment status" htmlFor="status">
            <select
              id="status"
              name="status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="field"
            >
              {["PROBATION", "CONFIRMED", "RESIGNED"].map((s) => (
                <option key={s} value={s}>{EMPLOYMENT_STATUS_LABEL[s]}</option>
              ))}
            </select>
          </Field>
          <Field label="Joining date" htmlFor="joinDate" hint="Drives pro-rata accrual (§7).">
            <input
              id="joinDate" name="joinDate" type="date" required
              defaultValue={v.joinDate || todayKey()} className="field"
            />
          </Field>
          <Field
            label="Confirmation date"
            htmlFor="confirmDate"
            hint={
              status === "CONFIRMED"
                ? "Required — Privileged Leave accrues only from this date (§6, §7)."
                : "Leave blank while on probation."
            }
          >
            <input
              id="confirmDate" name="confirmDate" type="date"
              defaultValue={v.confirmDate} className="field"
              required={status === "CONFIRMED"}
            />
          </Field>
        </div>

        {status === "PROBATION" && (
          <div className="mt-4">
            <PolicyNote level="INFO" title="On probation, Privileged Leave doesn't accrue" clause="§6 · §7">
              Casual and Sick Leave credit quarterly from the joining date. Privileged Leave is
              credited pro-rata the moment you confirm them.
            </PolicyNote>
          </div>
        )}
      </section>

      {showOpening && (
        <section className="card p-5 sm:p-6">
          <SectionHeader
            eyebrow="Step 3 — optional"
            title="Balance as it stands today"
          />
          <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: "var(--c-ink-500)" }}>
            Enter what your current records show this person has left <em>right now</em> — the same
            number you would read off your spreadsheet today. LeaveBase reconciles it against the
            accrual it has already worked out for this leave year, so the balance shown afterwards
            is exactly the figure you type. Leave blank to accrue from the joining date alone.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-4">
            {BALANCE_TYPES.map((t) => (
              <Field key={t} label={LEAVE_META[t].name} htmlFor={`opening_${t}`}>
                <input
                  id={`opening_${t}`}
                  name={`opening_${t}`}
                  type="number"
                  step="0.5"
                  min="0"
                  placeholder="0"
                  className="field"
                />
              </Field>
            ))}
          </div>
        </section>
      )}

      {state.error && <PolicyNote level="BLOCK" title={state.error} />}
      {state.ok && !state.tempPassword && <PolicyNote level="INFO" title={state.ok} />}

      {state.tempPassword && (
        <section className="card space-y-4 p-5 sm:p-6">
          <SectionHeader eyebrow="Done" title={state.ok ?? "Added"} />
          <TempPassword password={state.tempPassword} />
          <div className="flex flex-wrap gap-2.5">
            {state.userId && (
              <button
                type="button"
                onClick={() => router.push(`/employees/${state.userId}`)}
                className="btn btn-primary"
              >
                Open their record
              </button>
            )}
            <button
              type="button"
              onClick={() => router.refresh()}
              className="btn btn-ghost"
            >
              Add another person
            </button>
          </div>
        </section>
      )}

      {!state.tempPassword && (
        <div className="flex flex-wrap gap-2.5">
          <Submit label={mode === "create" ? "Add employee" : "Save changes"} />
          <button type="button" onClick={() => router.back()} className="btn btn-ghost">
            Cancel
          </button>
        </div>
      )}
    </form>
  );
}

function Field({
  label, htmlFor, hint, children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && (
        <p className="mt-1.5 text-[11px] leading-snug" style={{ color: "var(--c-ink-400)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}
