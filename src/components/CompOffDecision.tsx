"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Loader2, X } from "lucide-react";
import { compOffDecisionAction, type CompOffState } from "@/app/(app)/comp-off/actions";
import { PolicyNote } from "./ui/primitives";

function Buttons({ onPick, canReject }: { onPick: (a: string) => void; canReject: boolean }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex gap-2.5">
      <button
        type="submit"
        onClick={() => onPick("APPROVED")}
        disabled={pending}
        className="btn btn-success flex-1"
        style={{ padding: "8px 16px" }}
      >
        {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={2.8} />}
        Credit the comp-off
      </button>
      <button
        type="submit"
        onClick={() => onPick("REJECTED")}
        disabled={pending || !canReject}
        title={canReject ? undefined : "Add a reason to reject"}
        className="btn btn-danger"
        style={{ padding: "8px 16px" }}
      >
        <X size={14} strokeWidth={2.8} />
        Reject
      </button>
    </div>
  );
}

export function CompOffDecision({ creditId }: { creditId: string }) {
  const [state, action] = useActionState<CompOffState, FormData>(compOffDecisionAction, {});
  const [choice, setChoice] = useState("APPROVED");
  const [comment, setComment] = useState("");

  if (state.ok) {
    return <PolicyNote level="INFO" title="Recorded" >The employee has been notified.</PolicyNote>;
  }

  return (
    <form action={action} className="space-y-2.5">
      <input type="hidden" name="creditId" value={creditId} />
      <input type="hidden" name="action" value={choice} />
      <input
        type="text"
        name="comment"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Note — required if you're rejecting"
        className="field"
      />
      {state.error && <PolicyNote level="BLOCK" title={state.error} />}
      <Buttons onPick={setChoice} canReject={comment.trim().length > 2} />
      <p className="text-[11px]" style={{ color: "var(--c-ink-400)" }}>
        §11 — approving credits one comp-off, which must be availed within 20 days of the day worked.
      </p>
    </form>
  );
}
