"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Wallet } from "lucide-react";
import {
  adjustBalanceAction, confirmEmployeeAction, previewHistoricalLeave, recordAbsenceAction,
  recordExitAction, recordLeaveAction, resolveFlagAction, type HrState, type LeavePreview,
} from "./actions";
import { PolicyNote } from "@/components/ui/primitives";
import { BALANCE_TYPES, HALF_DAY_LABEL, LEAVE_META } from "@/lib/policy/types";
import { fmtDate, fmtDays, todayKey } from "@/lib/date";

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

export function RecordLeaveTaken({ userId, name }: { userId: string; name: string }) {
  const [state, action] = useActionState<HrState, FormData>(recordLeaveAction, {});
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("CL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [halfDay, setHalfDay] = useState("NONE");
  const today = todayKey();
  const singleDay = !!from && (from === to || !to);

  // Live, read-only preview of the balance impact — recomputed shortly after the dates or type
  // settle, so filling the form doesn't fire a request on every keystroke.
  const [preview, setPreview] = useState<LeavePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const requestSeq = useRef(0);

  useEffect(() => {
    if (!open || !from) { setPreview(null); return; }
    const seq = ++requestSeq.current;
    setPreviewLoading(true);
    const timer = setTimeout(() => {
      previewHistoricalLeave({
        userId, leaveType: type, from, to: to || from,
        halfDay: singleDay ? halfDay : "NONE",
      })
        .then((result) => { if (seq === requestSeq.current) setPreview(result); })
        .finally(() => { if (seq === requestSeq.current) setPreviewLoading(false); });
    }, 350);
    return () => clearTimeout(timer);
  }, [open, userId, type, from, to, halfDay, singleDay]);

  if (state.ok) {
    return (
      <div className="space-y-3">
        <PolicyNote level="INFO" title={state.ok}>
          It appears in {name.split(" ")[0]}&rsquo;s leave history and the balance has been deducted.
        </PolicyNote>
        <button type="button" onClick={() => window.location.reload()} className="btn btn-ghost w-full">
          Record another
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost w-full">
        Record leave already taken
      </button>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="userId" value={userId} />
      <div>
        <label className="label" htmlFor="rec-type">Leave type</label>
        <select
          id="rec-type" name="leaveType" className="field"
          value={type} onChange={(e) => setType(e.target.value)}
        >
          {(["CL", "SL", "PL", "COMP_OFF", "MATERNITY", "PATERNITY"] as const).map((t) => (
            <option key={t} value={t}>{LEAVE_META[t].name}</option>
          ))}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="rec-from">First day</label>
          <input
            id="rec-from" name="from" type="date" max={today} className="field" required
            value={from} onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="rec-to">Last day</label>
          <input
            id="rec-to" name="to" type="date" max={today} className="field"
            value={to} onChange={(e) => setTo(e.target.value)} min={from || undefined}
          />
        </div>
      </div>
      {singleDay && (
        <div>
          <label className="label" htmlFor="rec-half">Duration</label>
          <select
            id="rec-half" name="halfDay" className="field"
            value={halfDay} onChange={(e) => setHalfDay(e.target.value)}
          >
            {(["NONE", "FIRST_HALF", "SECOND_HALF"] as const).map((h) => (
              <option key={h} value={h}>{HALF_DAY_LABEL[h]}</option>
            ))}
          </select>
        </div>
      )}

      {from && (
        <BalanceImpactPreview
          preview={preview}
          loading={previewLoading}
          type={type}
          typeName={LEAVE_META[type as keyof typeof LEAVE_META]?.name}
          from={from}
        />
      )}

      <div>
        <label className="label" htmlFor="rec-reason">What was it for?</label>
        <input
          id="rec-reason" name="reason" className="field" required
          placeholder="e.g. Family wedding — taken before LeaveBase went live."
        />
      </div>
      {state.error && <PolicyNote level="BLOCK" title={state.error} />}
      <div className="flex gap-2.5">
        <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost flex-1">
          Cancel
        </button>
        <div className="flex-1">
          <Submit label="Record it" />
        </div>
      </div>
      <p className="text-[11px] leading-snug" style={{ color: "var(--c-ink-400)" }}>
        The advance-notice rules (§6, §15) are skipped — they govern an employee asking for leave,
        not you writing down what already happened. The §8 intervening-days rule and the balance
        deduction still apply in full, and a shortfall becomes Loss of Pay (§13).
      </p>
    </form>
  );
}

/**
 * What recording this leave would actually do, before it's submitted. "Today" decides paid vs.
 * unpaid — a backdated entry draws on the balance available *now*, not what stood on the day
 * itself — so both figures are shown side by side rather than just one, to make that explicit.
 */
function BalanceImpactPreview({
  preview, loading, type, typeName, from,
}: {
  preview: LeavePreview | null;
  loading: boolean;
  type: string;
  typeName?: string;
  from: string;
}) {
  if (!preview) {
    return loading ? (
      <div
        className="flex items-center gap-2 rounded-xl px-3.5 py-3 text-[12px]"
        style={{ background: "var(--c-surface-2)", color: "var(--c-ink-400)" }}
      >
        <Loader2 size={13} className="animate-spin" />
        Working out the balance impact…
      </div>
    ) : null;
  }

  if (!preview.ok) {
    return <PolicyNote level="WARN" title={preview.error} />;
  }

  const current = preview.balances.find((b) => b.type === type);

  return (
    <div className="space-y-3 rounded-xl p-3.5" style={{ background: "var(--c-surface-2)" }}>
      <div className="flex items-center gap-2">
        <Wallet size={13} style={{ color: "var(--c-ink-400)" }} />
        <p className="text-[11px] font-bold uppercase tracking-[0.04em]" style={{ color: "var(--c-ink-400)" }}>
          Balance impact
        </p>
        {loading && <Loader2 size={11} className="animate-spin" style={{ color: "var(--c-ink-400)" }} />}
      </div>

      <div className="space-y-1.5">
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 text-[10.5px] font-bold" style={{ color: "var(--c-ink-400)" }}>
          <span />
          <span className="text-right">On {fmtDate(from)}</span>
          <span className="text-right">Today</span>
        </div>
        {preview.balances.map((b) => (
          <div
            key={b.type}
            className="grid grid-cols-[1fr_auto_auto] gap-x-3 text-[12px]"
            style={b.type === type ? { fontWeight: 700 } : undefined}
          >
            <span style={{ color: "var(--c-ink-700)" }}>{b.name}</span>
            <span className="text-right tnum" style={{ color: "var(--c-ink-500)" }}>{fmtDays(b.availableOnDate)}</span>
            <span className="text-right tnum" style={{ color: "var(--c-ink-900)" }}>{fmtDays(b.availableToday)}</span>
          </div>
        ))}
      </div>

      <div className="border-t pt-2.5" style={{ borderColor: "var(--c-border)" }}>
        {!preview.accrues ? (
          <p className="text-[12px] leading-snug" style={{ color: "var(--c-ink-500)" }}>
            {typeName} isn&rsquo;t tracked against a day balance — all {fmtDays(preview.chargedDays)} would be
            recorded in full, subject to its own entitlement limit (§9/§10).
          </p>
        ) : (
          <>
            <p className="text-[12.5px] leading-snug" style={{ color: "var(--c-ink-700)" }}>
              <strong className="tnum">{fmtDays(preview.chargedDays)}</strong> would be charged
              {preview.payable > 0 && (
                <>
                  {" "}— <strong className="tnum">{fmtDays(preview.payable)}</strong> from {typeName}
                </>
              )}
              {preview.lopDays > 0 && (
                <>
                  {preview.payable > 0 ? ", and " : " — "}
                  <strong className="tnum" style={{ color: "var(--c-danger-ink)" }}>
                    {fmtDays(preview.lopDays)} unpaid (LOP)
                  </strong>
                </>
              )}
              .
            </p>
            <p className="mt-1 text-[12px]" style={{ color: "var(--c-ink-500)" }}>
              {typeName} today: <span className="tnum">{fmtDays(current?.availableToday ?? 0)}</span>
              {" → after this: "}
              <strong className="tnum" style={{ color: "var(--c-ink-900)" }}>{fmtDays(preview.newAvailableToday)}</strong>
            </p>
          </>
        )}
      </div>
    </div>
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
