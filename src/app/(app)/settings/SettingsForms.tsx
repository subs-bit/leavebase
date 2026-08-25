"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Play, Trash2 } from "lucide-react";
import {
  addHolidayAction, removeHolidayAction, runMaintenanceAction, savePolicyAction,
  type SettingsState,
} from "./actions";
import { PolicyNote } from "@/components/ui/primitives";
import { POLICY_FIELDS, type PolicyConfig } from "@/lib/policy/config";
import { weekdayName } from "@/lib/date";

function Result({ state }: { state: SettingsState }) {
  if (state.error) return <PolicyNote level="BLOCK" title={state.error} />;
  if (state.ok) return <PolicyNote level="INFO" title={state.ok} />;
  return null;
}

function Save({ label = "Save settings" }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary">
      {pending && <Loader2 size={14} className="animate-spin" />}
      {label}
    </button>
  );
}

export function PolicyForm({ cfg }: { cfg: PolicyConfig }) {
  const [state, action] = useActionState<SettingsState, FormData>(savePolicyAction, {});

  const groups = [...new Set(POLICY_FIELDS.map((f) => f.group))];

  return (
    <form action={action} className="space-y-6">
      {groups.map((group) => (
        <div key={group}>
          <p className="eyebrow mb-3">{group}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {POLICY_FIELDS.filter((f) => f.group === group).map((f) => (
              <div key={f.key}>
                <label className="label" htmlFor={f.key}>
                  {f.label}
                  <span
                    className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold"
                    style={{ background: "var(--c-ink-100)", color: "var(--c-ink-400)" }}
                  >
                    {f.clause}
                  </span>
                </label>
                <div className="relative">
                  <input
                    id={f.key}
                    name={f.key}
                    type="number"
                    step="1"
                    min={f.min}
                    max={f.max}
                    defaultValue={String(cfg[f.key])}
                    className="field pr-[112px]"
                  />
                  <span
                    className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[11.5px] font-semibold"
                    style={{ color: "var(--c-ink-400)" }}
                  >
                    {f.unit}
                  </span>
                </div>
                {f.note && (
                  <p className="mt-1.5 text-[11px] leading-snug" style={{ color: "var(--c-ink-400)" }}>
                    {f.note}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      <div>
        <p className="eyebrow mb-3">Working week</p>
        <WeeklyOffPicker initial={cfg.weeklyOffs} />
      </div>

      <Result state={state} />
      <Save />
    </form>
  );
}

export function HolidayForm() {
  const [state, action] = useActionState<SettingsState, FormData>(addHolidayAction, {});
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr_auto]">
        <div>
          <label className="label" htmlFor="hol-date">Date</label>
          <input id="hol-date" name="date" type="date" required className="field" />
        </div>
        <div>
          <label className="label" htmlFor="hol-name">Name</label>
          <input id="hol-name" name="name" required className="field" placeholder="e.g. Diwali" />
        </div>
        <div>
          <label className="label" htmlFor="hol-type">Type</label>
          <select id="hol-type" name="type" className="field" defaultValue="DECLARED">
            <option value="DECLARED">Declared</option>
            <option value="NATIONAL">National</option>
            <option value="RESTRICTED">Restricted</option>
          </select>
        </div>
      </div>
      <Result state={state} />
      <Save label="Add holiday" />
    </form>
  );
}

function RemoveHolidayButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label="Remove holiday"
      aria-busy={pending}
      className="rounded-lg p-1.5 transition-colors hover:bg-[var(--c-danger-tint)]"
      style={{ color: "var(--c-ink-400)" }}
    >
      {pending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
    </button>
  );
}

export function RemoveHoliday({ holidayId }: { holidayId: string }) {
  const [state, action] = useActionState<SettingsState, FormData>(removeHolidayAction, {});
  if (state.ok) return <span className="text-[11px]" style={{ color: "var(--c-ink-400)" }}>Removed</span>;
  return (
    <form action={action}>
      <input type="hidden" name="holidayId" value={holidayId} />
      <RemoveHolidayButton />
    </form>
  );
}

export function MaintenanceJobs() {
  const [state, action] = useActionState<SettingsState, FormData>(runMaintenanceAction, {});

  const jobs = [
    { id: "accrual", label: "Post quarterly accrual", clause: "§7", desc: "Credits any leave the ledger is missing up to today. Safe to run repeatedly — it posts only the difference." },
    { id: "expire", label: "Lapse expired comp-offs", clause: "§11", desc: "Marks approved comp-off credits older than the expiry window as lapsed." },
    { id: "absence", label: "Scan for unaccounted absence", clause: "§12", desc: "Reviews recorded unauthorised absences for consecutive runs and raises absconding flags for HR to act on." },
    { id: "rollover", label: "Run year-end rollover", clause: "§4 · §6", desc: "Lapses Casual Leave, caps Privileged Leave at the ceiling, and opens next year's balances." },
  ];

  return (
    <div className="space-y-3">
      {jobs.map((j) => (
        <form key={j.id} action={action}>
          <input type="hidden" name="job" value={j.id} />
          <div
            className="flex flex-wrap items-center gap-3 rounded-2xl p-4"
            style={{ background: "var(--c-surface-2)" }}
          >
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold" style={{ color: "var(--c-ink-900)" }}>
                {j.label}
                <span
                  className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold"
                  style={{ background: "var(--c-ink-100)", color: "var(--c-ink-400)" }}
                >
                  {j.clause}
                </span>
              </p>
              <p className="mt-0.5 text-[11.5px] leading-snug" style={{ color: "var(--c-ink-500)" }}>
                {j.desc}
              </p>
            </div>
            <button type="submit" className="btn btn-ghost shrink-0" style={{ padding: "8px 14px" }}>
              <Play size={13} />
              Run
            </button>
          </div>
        </form>
      ))}
      <Result state={state} />
      <p className="text-[11px]" style={{ color: "var(--c-ink-400)" }}>
        Accrual and comp-off expiry also run automatically whenever someone signs in, so these
        buttons are for catching up after a gap or verifying a change.
      </p>
    </div>
  );
}

/**
 * Weekly-off day picker.
 *
 * Controlled by React state rather than a CSS `:checked` selector — the previous version set the
 * colours with an inline style attribute, which always beats a class, so the selected state was
 * invisible and the control looked broken. The real checkboxes stay in the DOM (visually hidden)
 * so the form still submits the same `weeklyOffs` values without JavaScript.
 */
function WeeklyOffPicker({ initial }: { initial: number[] }) {
  const [selected, setSelected] = useState<number[]>(initial);

  const toggle = (day: number) =>
    setSelected((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    );

  const workingDays = Array.from({ length: 7 }, (_, i) => i).filter((i) => !selected.includes(i));

  return (
    <div>
      <p className="label">Which days is the studio closed?</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Weekly offs">
        {Array.from({ length: 7 }, (_, i) => {
          const off = selected.includes(i);
          return (
            <button
              key={i}
              type="button"
              onClick={() => toggle(i)}
              aria-pressed={off}
              className="rounded-xl border px-3.5 py-2 text-[12.5px] font-bold transition-all duration-150"
              style={
                off
                  ? {
                      background: "var(--lt-pl-tint)",
                      borderColor: "var(--lt-pl)",
                      color: "var(--lt-pl)",
                    }
                  : {
                      background: "var(--c-surface-2)",
                      borderColor: "var(--c-border)",
                      color: "var(--c-ink-400)",
                    }
              }
            >
              {weekdayName(i, true)}
            </button>
          );
        })}
      </div>

      {/* what the form actually submits */}
      {selected.map((d) => (
        <input key={d} type="hidden" name="weeklyOffs" value={d} />
      ))}

      <p className="mt-2.5 text-[12px]" style={{ color: "var(--c-ink-500)" }}>
        {selected.length === 0 ? (
          <span style={{ color: "var(--c-danger-ink)", fontWeight: 600 }}>
            Pick at least one day off, or the studio never closes.
          </span>
        ) : selected.length === 7 ? (
          <span style={{ color: "var(--c-danger-ink)", fontWeight: 600 }}>
            At least one day must be a working day.
          </span>
        ) : (
          <>
            <strong style={{ color: "var(--c-ink-900)" }}>
              {selected.map((d) => weekdayName(d)).join(" and ")}
            </strong>{" "}
            off &middot; working {workingDays.map((d) => weekdayName(d, true)).join(", ")}
          </>
        )}
      </p>

      <p className="mt-1.5 text-[11px] leading-snug" style={{ color: "var(--c-ink-400)" }}>
        Drives which days count as working days, and therefore the §8 intervening-days rule.
        Changing this does not recompute leave already approved.
      </p>
    </div>
  );
}
