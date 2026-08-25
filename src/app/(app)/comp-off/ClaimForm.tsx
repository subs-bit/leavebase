"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Plus } from "lucide-react";
import { claimAction, type CompOffState } from "./actions";
import { PolicyNote } from "@/components/ui/primitives";
import { addDaysKey, fmtDate, todayKey } from "@/lib/date";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary w-full">
      {pending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} strokeWidth={2.6} />}
      Raise the claim
    </button>
  );
}

export function ClaimForm({ expiryDays, eligibleDays }: { expiryDays: number; eligibleDays: string[] }) {
  const [state, action] = useActionState<CompOffState, FormData>(claimAction, {});
  const [open, setOpen] = useState(false);
  const [workedDate, setWorkedDate] = useState("");
  const today = todayKey();

  if (state.ok) {
    return (
      <PolicyNote level="INFO" title="Claim raised">
        Your reporting manager has been notified. Once approved, the credit appears in your balance
        and must be used within {expiryDays} days of the day you worked.
      </PolicyNote>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-primary">
        <Plus size={15} strokeWidth={2.6} />
        Claim a comp-off
      </button>
    );
  }

  return (
    <form action={action} className="card space-y-3.5 p-5">
      <div>
        <label className="label" htmlFor="workedDate">Which day did you work?</label>
        <select
          id="workedDate"
          name="workedDate"
          value={workedDate}
          onChange={(e) => setWorkedDate(e.target.value)}
          required
          className="field"
        >
          <option value="">Choose a holiday or weekly off…</option>
          {eligibleDays.map((d) => (
            <option key={d} value={d}>
              {fmtDate(d)}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-[11.5px]" style={{ color: "var(--c-ink-400)" }}>
          Only declared holidays and weekly offs you've already worked can be claimed (§11).
        </p>
      </div>

      <div>
        <label className="label" htmlFor="reason">What were you working on?</label>
        <textarea
          id="reason"
          name="reason"
          rows={2}
          required
          className="field resize-none"
          placeholder="Your manager needs to recognise the work — be specific."
        />
      </div>

      {workedDate && (
        <PolicyNote level="INFO" title="If approved, use it by" clause="§11">
          {fmtDate(addDaysKey(workedDate, expiryDays))} — comp-off lapses {expiryDays} days after
          the day worked.
        </PolicyNote>
      )}

      {state.error && <PolicyNote level="BLOCK" title={state.error} />}

      <div className="flex gap-2.5">
        <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost flex-1">
          Cancel
        </button>
        <div className="flex-1">
          <Submit />
        </div>
      </div>
    </form>
  );
}
