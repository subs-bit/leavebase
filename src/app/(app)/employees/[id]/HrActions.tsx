"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import {
  adjustBalanceAction, confirmEmployeeAction, recordAbsenceAction, recordExitAction,
  resolveFlagAction, type HrState,
} from "./actions";
import { PolicyNote } from "@/components/ui/primitives";
import { BALANCE_TYPES, LEAVE_META } from "@/lib/policy/types";
import { todayKey } from "@/lib/date";

function Submit({ label, tone = "primary" }: { label: string; tone?: "primary" | "danger" }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`btn ${tone === "danger" ? "btn-danger" : "btn-primary"} w-full`}
    >
      {pending && <Loader2 size={14} className="animate-spin" />}
      {label}
    </button>
  );
}

function Result({ state }: { state: HrState }) {
  if (state.error) return <PolicyNote level="BLOCK" title={state.error} />;
  if (state.ok) return <PolicyNote level="INFO" title={state.ok} />;
  return null;
}

export function AdjustBalance({ userId }: { userId: string }) {
  const [state, action] = useActionState<HrState, FormData>(adjustBalanceAction, {});
  const [amount, setAmount] = useState("");

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="userId" value={userId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="adj-type">Leave type</label>
          <select id="adj-type" name="leaveType" className="field" defaultValue="CL">
            {BALANCE_TYPES.map((t) => (
              <option key={t} value={t}>{LEAVE_META[t].name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="adj-amount">Days (+ credit / − debit)</label>
          <input
            id="adj-amount"
            name="amount"
            type="number"
            step="0.5"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 1.5 or -2"
            className="field"
            required
          />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="adj-note">Reason for the correction</label>
        <input
          id="adj-note"
          name="note"
          className="field"
          placeholder="This is written into the ledger permanently."
          required
        />
      </div>
      <Result state={state} />
      <Submit label="Post adjustment" />
      <p className="text-[11px]" style={{ color: "var(--c-ink-400)" }}>
        Adjustments are ledger entries, not overwrites — the original accrual and usage stay visible.
      </p>
    </form>
  );
}

export function ConfirmEmployee({ userId, suggested }: { userId: string; suggested: string }) {
  const [state, action] = useActionState<HrState, FormData>(confirmEmployeeAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="userId" value={userId} />
      <div>
        <label className="label" htmlFor="confirmDate">Confirmation effective from</label>
        <input
          id="confirmDate"
          name="confirmDate"
          type="date"
          defaultValue={suggested}
          className="field"
          required
        />
      </div>
      <Result state={state} />
      <Submit label="Confirm employee" />
      <p className="text-[11px]" style={{ color: "var(--c-ink-400)" }}>
        §6 and §7 — Privileged Leave becomes available and is credited pro-rata from this date.
      </p>
    </form>
  );
}

export function RecordExit({ userId }: { userId: string }) {
  const [state, action] = useActionState<HrState, FormData>(recordExitAction, {});
  const [open, setOpen] = useState(false);
  const today = todayKey();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost w-full">
        Record a resignation
      </button>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="userId" value={userId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="resignDate">Resignation date</label>
          <input id="resignDate" name="resignDate" type="date" defaultValue={today} className="field" required />
        </div>
        <div>
          <label className="label" htmlFor="lastWorkingDay">Last working day</label>
          <input id="lastWorkingDay" name="lastWorkingDay" type="date" className="field" required />
        </div>
      </div>
      <Result state={state} />
      <div className="flex gap-2.5">
        <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost flex-1">
          Cancel
        </button>
        <div className="flex-1">
          <Submit label="Record exit" tone="danger" />
        </div>
      </div>
      <p className="text-[11px]" style={{ color: "var(--c-ink-400)" }}>
        §17 — leave before the last working day will then need both reporting manager and head of
        department approval, and excess CL or PL is flagged for recovery in full &amp; final settlement.
      </p>
    </form>
  );
}

export function RecordAbsence({ userId }: { userId: string }) {
  const [state, action] = useActionState<HrState, FormData>(recordAbsenceAction, {});
  const [open, setOpen] = useState(false);
  const today = todayKey();

  if (state.ok) return <PolicyNote level="INFO" title={state.ok} />;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost w-full">
        Record unauthorised absence
      </button>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="userId" value={userId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="abs-from">First day absent</label>
          <input id="abs-from" name="from" type="date" max={today} className="field" required />
        </div>
        <div>
          <label className="label" htmlFor="abs-to">Last day absent</label>
          <input id="abs-to" name="to" type="date" max={today} className="field" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="abs-note">What happened</label>
        <input
          id="abs-note"
          name="note"
          className="field"
          placeholder="e.g. Did not report and did not respond to calls."
          required
        />
      </div>
      {state.error && <PolicyNote level="BLOCK" title={state.error} />}
      <div className="flex gap-2.5">
        <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost flex-1">
          Cancel
        </button>
        <div className="flex-1">
          <Submit label="Record absence" tone="danger" />
        </div>
      </div>
      <p className="text-[11px]" style={{ color: "var(--c-ink-400)" }}>
        §13 — these days are unpaid and draw no leave balance. Consecutive runs are what the
        absconding check under §12 reads; it raises a flag for you, it never terminates anyone.
      </p>
    </form>
  );
}

export function ResolveFlag({ flagId }: { flagId: string }) {
  const [state, action] = useActionState<HrState, FormData>(resolveFlagAction, {});
  const [outcome, setOutcome] = useState("RESOLVED");

  if (state.ok) return <PolicyNote level="INFO" title={state.ok} />;

  return (
    <form action={action} className="mt-3 space-y-2.5">
      <input type="hidden" name="flagId" value={flagId} />
      <input type="hidden" name="outcome" value={outcome} />
      <input
        name="resolution"
        className="field"
        placeholder="What was decided? e.g. 'Medical emergency — SL applied retrospectively.'"
        required
      />
      {state.error && <PolicyNote level="BLOCK" title={state.error} />}
      <div className="flex gap-2.5">
        <button
          type="submit"
          onClick={() => setOutcome("RESOLVED")}
          className="btn btn-primary flex-1"
          style={{ padding: "8px 14px" }}
        >
          Mark resolved
        </button>
        <button
          type="submit"
          onClick={() => setOutcome("DISMISSED")}
          className="btn btn-ghost flex-1"
          style={{ padding: "8px 14px" }}
        >
          Dismiss — not an absence
        </button>
      </div>
    </form>
  );
}
