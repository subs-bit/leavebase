"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  ArrowRight, CalendarRange, CheckCircle2, CircleSlash, FileCheck2, Loader2, Info,
  TriangleAlert, XCircle,
} from "lucide-react";
import { applyAction, type ApplyState } from "./actions";
import { PolicyNote, leaveInk, leaveTint } from "@/components/ui/primitives";
import { addDaysKey, fmtDate, fmtDateFull, fmtDays, pluralDays, todayKey } from "@/lib/date";
import { HALF_DAY_LABEL, LEAVE_META } from "@/lib/policy/types";
import type { LeaveType } from "@/lib/policy/types";
import type { Evaluation } from "@/lib/policy/evaluate";

type BalanceLite = { leaveType: string; available: number; granted: number };

export type ApplyFormProps = {
  balances: BalanceLite[];
  compOffAvailable: number;
  availableTypes: LeaveType[];
  gender: string;
  status: string;
  initialType?: LeaveType;
  initialStart?: string;
};

const ICON_FOR: Record<string, string> = {
  CL: "Everyday & unforeseen",
  SL: "Medical",
  PL: "Planned time off",
  MATERNITY: "Up to 26 weeks",
  PATERNITY: "5 days",
  COMP_OFF: "Earned by working a holiday",
};

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={disabled || pending} className="btn btn-primary w-full py-3">
      {pending ? (
        <>
          <Loader2 size={15} className="animate-spin" /> Submitting…
        </>
      ) : (
        <>
          Submit request <ArrowRight size={15} strokeWidth={2.6} />
        </>
      )}
    </button>
  );
}

export function ApplyForm({
  balances, compOffAvailable, availableTypes, gender, status, initialType, initialStart,
}: ApplyFormProps) {
  const today = todayKey();
  const [state, action] = useActionState<ApplyState, FormData>(applyAction, {});

  const [leaveType, setLeaveType] = useState<LeaveType>(initialType ?? "CL");
  const [start, setStart] = useState(initialStart ?? "");
  const [end, setEnd] = useState(initialStart ?? "");
  const [halfDay, setHalfDay] = useState<"NONE" | "FIRST_HALF" | "SECOND_HALF">("NONE");
  const [reason, setReason] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [hasMedicalDoc, setHasMedicalDoc] = useState(false);
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [maternityPattern, setMaternityPattern] = useState<"SPLIT_8_18" | "POST_26">("SPLIT_8_18");

  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const seq = useRef(0);

  const meta = LEAVE_META[leaveType];
  const singleDay = !!start && start === end;

  // Keep end ≥ start without fighting the user mid-edit.
  useEffect(() => {
    if (start && (!end || end < start)) setEnd(start);
  }, [start]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!singleDay && halfDay !== "NONE") setHalfDay("NONE");
  }, [singleDay, halfDay]);

  // ── live evaluation ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!start || !end) {
      setEvaluation(null);
      return;
    }
    const id = ++seq.current;
    setEvaluating(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leaveType, start, end, halfDay, hasMedicalDoc,
            expectedDelivery: expectedDelivery || null,
            maternityPattern: leaveType === "MATERNITY" ? maternityPattern : null,
          }),
        });
        const json = await res.json();
        if (id !== seq.current) return;
        setEvaluation(res.ok ? json : null);
      } catch {
        if (id === seq.current) setEvaluation(null);
      } finally {
        if (id === seq.current) setEvaluating(false);
      }
    }, 260);
    return () => clearTimeout(t);
  }, [leaveType, start, end, halfDay, hasMedicalDoc, expectedDelivery, maternityPattern]);

  const blocked = evaluation ? !evaluation.ok : false;
  const canSubmit = !!start && !!end && reason.trim().length > 2 && !!evaluation && evaluation.ok;

  const balanceFor = (t: string) =>
    t === "COMP_OFF"
      ? compOffAvailable
      : balances.find((b) => b.leaveType === t)?.available ?? 0;

  return (
    <form action={action} className="grid gap-5 lg:grid-cols-[1.15fr_1fr] lg:items-start">
      {/* hidden mirrors of controlled state */}
      <input type="hidden" name="leaveType" value={leaveType} />
      <input type="hidden" name="halfDay" value={halfDay} />
      <input type="hidden" name="maternityPattern" value={maternityPattern} />

      {/* ── left: the form ─────────────────────────────────────────────── */}
      <div className="space-y-5">
        <section className="card p-5 sm:p-6">
          <p className="eyebrow mb-3">Step 1 · What kind of leave</p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {availableTypes.map((t) => {
              const active = t === leaveType;
              const m = LEAVE_META[t];
              const avail = balanceFor(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setLeaveType(t)}
                  className="relative flex flex-col items-start gap-1 rounded-2xl border p-3.5 text-left transition-all duration-150"
                  style={{
                    background: active ? leaveTint(t) : "var(--c-surface-2)",
                    borderColor: active ? leaveInk(t) : "var(--c-border)",
                    boxShadow: active ? `0 8px 20px -10px ${leaveInk(t)}` : undefined,
                  }}
                >
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-extrabold"
                    style={{
                      background: active ? leaveInk(t) : leaveTint(t),
                      color: active ? "#fff" : leaveInk(t),
                    }}
                  >
                    {m.short}
                  </span>
                  <span
                    className="mt-0.5 text-[13px] font-bold leading-tight"
                    style={{ color: active ? leaveInk(t) : "var(--c-ink-900)" }}
                  >
                    {m.name}
                  </span>
                  <span className="text-[10.5px] leading-tight" style={{ color: "var(--c-ink-400)" }}>
                    {m.accrues ? `${fmtDays(avail)} available` : ICON_FOR[t]}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-3.5 text-[12px] leading-relaxed" style={{ color: "var(--c-ink-500)" }}>
            <span className="font-bold" style={{ color: leaveInk(leaveType) }}>{meta.clause}</span>{" "}
            {meta.blurb}
          </p>
        </section>

        <section className="card p-5 sm:p-6">
          <p className="eyebrow mb-3">Step 2 · When</p>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="start">First day</label>
              <input
                id="start" name="start" type="date" required
                value={start}
                min={meta.retrospective ? undefined : today}
                onChange={(e) => setStart(e.target.value)}
                className="field"
              />
            </div>
            <div>
              <label className="label" htmlFor="end">Last day</label>
              <input
                id="end" name="end" type="date" required
                value={end}
                min={start || undefined}
                onChange={(e) => setEnd(e.target.value)}
                className="field"
              />
            </div>
          </div>

          {start && (
            <div className="mt-3 flex flex-wrap gap-2">
              {[1, 2, 3, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setEnd(addDaysKey(start, n - 1))}
                  className="chip transition-colors"
                  style={{
                    background: end === addDaysKey(start, n - 1) ? "var(--lt-pl-tint)" : "var(--c-ink-100)",
                    color: end === addDaysKey(start, n - 1) ? "var(--lt-pl)" : "var(--c-ink-500)",
                    cursor: "pointer",
                  }}
                >
                  {n} {n === 1 ? "day" : "days"}
                </button>
              ))}
            </div>
          )}

          {singleDay && meta.halfDayAllowed && (
            <div className="mt-4">
              <p className="label">Duration</p>
              <div className="flex flex-wrap gap-2">
                {(["NONE", "FIRST_HALF", "SECOND_HALF"] as const).map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setHalfDay(h)}
                    className="rounded-xl border px-3.5 py-2 text-[12.5px] font-bold transition-all"
                    style={{
                      background: halfDay === h ? "var(--lt-pl-tint)" : "var(--c-surface-2)",
                      borderColor: halfDay === h ? "var(--lt-pl)" : "var(--c-border)",
                      color: halfDay === h ? "var(--lt-pl)" : "var(--c-ink-500)",
                    }}
                  >
                    {HALF_DAY_LABEL[h].replace(/ \(.*\)/, "")}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11.5px]" style={{ color: "var(--c-ink-400)" }}>
                §14 — a half-day is either the first four hours or the last four hours of the workday.
              </p>
            </div>
          )}

          {leaveType === "MATERNITY" && (
            <div className="mt-4 space-y-3.5">
              <div>
                <label className="label" htmlFor="expectedDelivery">Expected date of childbirth</label>
                <input
                  id="expectedDelivery" name="expectedDelivery" type="date"
                  value={expectedDelivery}
                  onChange={(e) => setExpectedDelivery(e.target.value)}
                  className="field"
                />
                <p className="mt-1.5 text-[11.5px]" style={{ color: "var(--c-ink-400)" }}>
                  §9 requires a medical certificate stating this date.
                </p>
              </div>
              <div>
                <p className="label">How you'd like to take it</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      ["SPLIT_8_18", "8 weeks before + 18 after"],
                      ["POST_26", "All 26 weeks after delivery"],
                    ] as const
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setMaternityPattern(v)}
                      className="rounded-xl border px-3.5 py-2.5 text-left text-[12.5px] font-bold transition-all"
                      style={{
                        background: maternityPattern === v ? "var(--lt-mat-tint)" : "var(--c-surface-2)",
                        borderColor: maternityPattern === v ? "var(--lt-mat)" : "var(--c-border)",
                        color: maternityPattern === v ? "var(--lt-mat)" : "var(--c-ink-500)",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {leaveType === "SL" && (
            <label
              className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border p-3.5"
              style={{
                background: hasMedicalDoc ? "var(--c-success-tint)" : "var(--c-surface-2)",
                borderColor: hasMedicalDoc ? "var(--c-success)" : "var(--c-border)",
              }}
            >
              <input
                type="checkbox" name="hasMedicalDoc" checked={hasMedicalDoc}
                onChange={(e) => setHasMedicalDoc(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[var(--c-success)]"
              />
              <span>
                <span className="block text-[13px] font-bold" style={{ color: "var(--c-ink-900)" }}>
                  I'm submitting medical documents to HR
                </span>
                <span className="mt-0.5 block text-[11.5px]" style={{ color: "var(--c-ink-500)" }}>
                  §5 — required beyond two consecutive sick days. Without them the leave is deducted
                  from Privileged Leave instead.
                </span>
              </span>
            </label>
          )}
        </section>

        <section className="card p-5 sm:p-6">
          <p className="eyebrow mb-3">Step 3 · Context for your approver</p>
          <div>
            <label className="label" htmlFor="reason">Reason</label>
            <textarea
              id="reason" name="reason" rows={3} required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="A line on why you need these dates — it's what your manager sees first."
              className="field resize-none"
            />
          </div>
          <div className="mt-3.5">
            <label className="label" htmlFor="contactInfo">
              Reachable on <span style={{ color: "var(--c-ink-400)", fontWeight: 500 }}>(optional)</span>
            </label>
            <input
              id="contactInfo" name="contactInfo" type="text"
              value={contactInfo}
              onChange={(e) => setContactInfo(e.target.value)}
              placeholder="Phone or alternate email while you're away"
              className="field"
            />
          </div>
        </section>

        {state.error && (
          <PolicyNote level="BLOCK" title={state.error}>
            Nothing was submitted. Adjust the request and try again.
          </PolicyNote>
        )}
      </div>

      {/* ── right: live policy preview ──────────────────────────────────── */}
      <aside className="space-y-4 lg:sticky lg:top-[88px]">
        <div className="card overflow-hidden">
          <div
            className="flex items-center justify-between px-5 py-3.5"
            style={{ background: leaveTint(leaveType) }}
          >
            <p className="eyebrow" style={{ color: leaveInk(leaveType) }}>
              Policy check
            </p>
            {evaluating ? (
              <Loader2 size={14} className="animate-spin" style={{ color: leaveInk(leaveType) }} />
            ) : evaluation ? (
              blocked ? (
                <XCircle size={15} style={{ color: "var(--c-danger)" }} />
              ) : (
                <CheckCircle2 size={15} style={{ color: "var(--c-success)" }} />
              )
            ) : null}
          </div>

          {!start || !end ? (
            <div className="px-5 py-10 text-center">
              <CalendarRange size={22} style={{ color: "var(--c-ink-400)" }} className="mx-auto" />
              <p className="mt-3 text-[13px] font-bold" style={{ color: "var(--c-ink-900)" }}>
                Pick your dates
              </p>
              <p className="mt-1 text-[12px]" style={{ color: "var(--c-ink-500)" }}>
                LeaveBase checks every rule in the policy as you choose, and shows exactly which
                days will be deducted.
              </p>
            </div>
          ) : !evaluation ? (
            <div className="space-y-2.5 p-5">
              <div className="skeleton h-4 w-2/3" />
              <div className="skeleton h-4 w-1/2" />
              <div className="skeleton h-16 w-full" />
            </div>
          ) : (
            <div className="p-5">
              {/* headline numbers */}
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="eyebrow mb-1">Will be deducted</p>
                  <p className="stat" style={{ fontSize: 34 }}>
                    {fmtDays(evaluation.chargedDays)}
                    <span
                      className="ml-1.5 text-[13px] font-bold"
                      style={{ color: "var(--c-ink-400)" }}
                    >
                      {evaluation.chargedDays === 1 ? "day" : "days"}
                    </span>
                  </p>
                </div>
                {meta.accrues && (
                  <div className="text-right">
                    <p className="eyebrow mb-1">Balance after</p>
                    <p
                      className="stat"
                      style={{
                        fontSize: 26,
                        color:
                          evaluation.availableAfter < 0
                            ? "var(--c-danger)"
                            : "var(--c-ink-900)",
                      }}
                    >
                      {fmtDays(Math.max(0, evaluation.availableAfter))}
                    </p>
                    <p className="text-[11px]" style={{ color: "var(--c-ink-400)" }}>
                      from {fmtDays(evaluation.availableBefore)}
                    </p>
                  </div>
                )}
              </div>

              {evaluation.lopDays > 0 && (
                <div
                  className="mt-3 rounded-xl px-3.5 py-2.5"
                  style={{ background: "var(--lt-lop-tint)" }}
                >
                  <p className="text-[12px] font-bold" style={{ color: "var(--lt-lop)" }}>
                    {pluralDays(evaluation.lopDays)} of this will be Loss of Pay (§13)
                  </p>
                </div>
              )}

              {/* day-by-day */}
              {evaluation.breakdown.lines.length > 0 && (
                <div className="mt-4">
                  <p className="eyebrow mb-2">Day by day</p>
                  <ul className="space-y-1">
                    {evaluation.breakdown.lines.map((l) => (
                      <li
                        key={l.date}
                        className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5"
                        style={{
                          background: l.extension
                            ? "var(--c-warning-tint)"
                            : l.charged > 0
                              ? "var(--c-surface-3)"
                              : "transparent",
                        }}
                      >
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{
                            background:
                              l.charged > 0 ? leaveInk(leaveType) : "var(--c-ink-200)",
                          }}
                        />
                        <span
                          className="flex-1 truncate text-[12px] font-semibold"
                          style={{
                            color: l.charged > 0 ? "var(--c-ink-900)" : "var(--c-ink-400)",
                          }}
                        >
                          {fmtDateFull(l.date)}
                        </span>
                        <span
                          className="shrink-0 truncate text-[11px]"
                          style={{ color: "var(--c-ink-400)", maxWidth: 116 }}
                          title={l.reason || l.label}
                        >
                          {l.dayType === "WORKING" ? (l.charged === 0.5 ? "Half day" : "") : l.label}
                        </span>
                        <span
                          className="w-8 shrink-0 text-right text-[12px] font-extrabold tnum"
                          style={{
                            color: l.charged > 0 ? "var(--c-ink-900)" : "var(--c-ink-400)",
                          }}
                        >
                          {l.charged > 0 ? fmtDays(l.charged) : "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* approval chain */}
              {evaluation.routing.length > 0 && (
                <div className="mt-4">
                  <p className="eyebrow mb-2">Goes to</p>
                  <ol className="space-y-1.5">
                    {evaluation.routing.map((r) => (
                      <li key={r.level} className="flex items-start gap-2.5">
                        <span
                          className="mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-extrabold"
                          style={{ background: "var(--lt-pl-tint)", color: "var(--lt-pl)" }}
                        >
                          {r.level}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className="block text-[12.5px] font-bold"
                            style={{ color: "var(--c-ink-900)" }}
                          >
                            {r.approverName}
                          </span>
                          <span className="block text-[11px]" style={{ color: "var(--c-ink-400)" }}>
                            {r.label}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}
        </div>

        {/* findings */}
        {evaluation && evaluation.findings.length > 0 && (
          <div className="space-y-2.5">
            {evaluation.findings.map((f, i) => (
              <PolicyNote key={i} level={f.level} title={f.title} clause={f.clause}>
                {f.detail}
              </PolicyNote>
            ))}
          </div>
        )}

        <div className="card p-4">
          <SubmitButton disabled={!canSubmit} />
          {!canSubmit && (
            <p className="mt-2.5 text-center text-[11.5px]" style={{ color: "var(--c-ink-400)" }}>
              {!start
                ? "Choose your dates to continue."
                : blocked
                  ? "Resolve the blocking rules above to submit."
                  : reason.trim().length <= 2
                    ? "Add a reason so your approver has context."
                    : "Checking the policy…"}
            </p>
          )}
        </div>
      </aside>
    </form>
  );
}
