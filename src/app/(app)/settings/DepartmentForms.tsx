"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  createDepartmentAction, deleteDepartmentAction, setHodAction, type SettingsState,
} from "./actions";
import { Avatar, PolicyNote } from "@/components/ui/primitives";

function Result({ state }: { state: SettingsState }) {
  if (state.error) return <PolicyNote level="BLOCK" title={state.error} />;
  if (state.ok) return <PolicyNote level="INFO" title={state.ok} />;
  return null;
}

function Submit({ label, icon }: { label: string; icon?: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary">
      {pending ? <Loader2 size={14} className="animate-spin" /> : icon}
      {label}
    </button>
  );
}

export function DepartmentForm() {
  const [state, action] = useActionState<SettingsState, FormData>(createDepartmentAction, {});
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1.6fr_1fr_auto]">
        <div>
          <label className="label" htmlFor="dept-name">Department name</label>
          <input id="dept-name" name="name" required className="field" placeholder="Post-Production" />
        </div>
        <div>
          <label className="label" htmlFor="dept-code">Short code</label>
          <input
            id="dept-code" name="code" required className="field uppercase"
            placeholder="PP" maxLength={6}
          />
        </div>
        <div className="flex items-end">
          <Submit label="Add" icon={<Plus size={14} strokeWidth={2.6} />} />
        </div>
      </div>
      <Result state={state} />
    </form>
  );
}

export function HodPicker({
  departmentId,
  currentHodId,
  candidates,
}: {
  departmentId: string;
  currentHodId: string | null;
  candidates: { id: string; name: string; designation: string; avatarHue: number }[];
}) {
  const [state, action] = useActionState<SettingsState, FormData>(setHodAction, {});
  const [value, setValue] = useState(currentHodId ?? "");
  const { pending } = useFormStatus();

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="departmentId" value={departmentId} />
      <select
        name="hodId"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="field"
        style={{ width: "auto", minWidth: 210, padding: "8px 12px", fontSize: 12.5 }}
      >
        <option value="">No head assigned</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>{c.name} — {c.designation}</option>
        ))}
      </select>
      {value !== (currentHodId ?? "") && (
        <button type="submit" disabled={pending} className="btn btn-primary" style={{ padding: "8px 14px" }}>
          {pending && <Loader2 size={13} className="animate-spin" />}
          Save
        </button>
      )}
      {state.error && (
        <span className="text-[11.5px] font-semibold" style={{ color: "var(--c-danger-ink)" }}>
          {state.error}
        </span>
      )}
    </form>
  );
}

export function DeleteDepartment({ departmentId, name }: { departmentId: string; name: string }) {
  const [state, action] = useActionState<SettingsState, FormData>(deleteDepartmentAction, {});
  const [confirming, setConfirming] = useState(false);
  const { pending } = useFormStatus();

  if (state.error) {
    return (
      <span className="text-[11px] font-semibold" style={{ color: "var(--c-danger-ink)", maxWidth: 260 }}>
        {state.error}
      </span>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`Delete ${name}`}
        className="rounded-lg p-1.5 transition-colors hover:bg-[var(--c-danger-tint)]"
        style={{ color: "var(--c-ink-400)" }}
      >
        <Trash2 size={14} />
      </button>
    );
  }

  return (
    <form action={action} className="flex items-center gap-1.5">
      <input type="hidden" name="departmentId" value={departmentId} />
      <button type="button" onClick={() => setConfirming(false)} className="btn btn-quiet" style={{ padding: "5px 10px", fontSize: 11.5 }}>
        Keep
      </button>
      <button type="submit" disabled={pending} className="btn btn-danger" style={{ padding: "5px 10px", fontSize: 11.5 }}>
        Delete
      </button>
    </form>
  );
}
