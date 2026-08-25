"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Loader2, X } from "lucide-react";
import { cancelAction, decideAction, type ActionState } from "@/app/(app)/requests/actions";
import { PolicyNote } from "./ui/primitives";

function Pending({ label, tone }: { label: string; tone: "success" | "danger" }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`btn ${tone === "success" ? "btn-success" : "btn-danger"} flex-1`}
    >
      {pending ? (
        <Loader2 size={15} className="animate-spin" />
      ) : tone === "success" ? (
        <Check size={15} strokeWidth={2.8} />
      ) : (
        <X size={15} strokeWidth={2.8} />
      )}
      {label}
    </button>
  );
}

/** Approver's decision box. Rejection requires a reason — §18 asks for clear communication. */
export function DecisionPanel({ requestId }: { requestId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(decideAction, {});
  const [mode, setMode] = useState<"none" | "approve" | "reject">("none");
  const [comment, setComment] = useState("");

  if (state.ok) {
    return (
      <PolicyNote level="INFO" title="Decision recorded">
        The employee has been notified and the balance ledger is updated.
      </PolicyNote>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="action" value={mode === "reject" ? "REJECTED" : "APPROVED"} />

      <div>
        <label className="label" htmlFor="comment">
          {mode === "reject" ? "Why are you rejecting this?" : "Note"}
          {mode !== "reject" && (
            <span style={{ color: "var(--c-ink-400)", fontWeight: 500 }}> (optional)</span>
          )}
        </label>
        <textarea
          id="comment"
          name="comment"
          rows={2}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={
            mode === "reject"
              ? "Give them something they can act on — a business reason, or dates that would work."
              : "Anything they should know before they go."
          }
          className="field resize-none"
        />
      </div>

      {state.error && (
        <PolicyNote level="BLOCK" title={state.error} />
      )}

      <div className="flex gap-2.5">
        <button
          type="submit"
          onClick={() => setMode("approve")}
          className="btn btn-success flex-1"
        >
          <Check size={15} strokeWidth={2.8} />
          Approve
        </button>
        <button
          type="submit"
          onClick={() => setMode("reject")}
          disabled={comment.trim().length < 3}
          title={comment.trim().length < 3 ? "A reason is required to reject" : undefined}
          className="btn btn-danger flex-1"
        >
          <X size={15} strokeWidth={2.8} />
          Reject
        </button>
      </div>
      <p className="text-center text-[11px]" style={{ color: "var(--c-ink-400)" }}>
        Rejections need a reason. §18 asks for decisions to be communicated clearly and promptly.
      </p>
    </form>
  );
}

/** Employee withdrawing, or a manager cancelling sanctioned leave (§16). */
export function CancelPanel({
  requestId,
  mode,
}: {
  requestId: string;
  mode: "withdraw" | "cancel";
}) {
  const [state, action] = useActionState<ActionState, FormData>(cancelAction, {});
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (state.ok) {
    return (
      <PolicyNote level="INFO" title={mode === "withdraw" ? "Request withdrawn" : "Leave cancelled"}>
        {mode === "cancel"
          ? "The employee has been told. If they proceed to take this leave it will be treated as unauthorised absence (§16)."
          : "Any days held against this request have been released."}
      </PolicyNote>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost w-full">
        {mode === "withdraw" ? "Withdraw this request" : "Cancel this leave"}
      </button>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="requestId" value={requestId} />
      <div>
        <label className="label" htmlFor="reason">
          {mode === "withdraw" ? "Why are you withdrawing it?" : "Why is this being cancelled?"}
        </label>
        <textarea
          id="reason"
          name="reason"
          rows={2}
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="field resize-none"
          placeholder={
            mode === "withdraw" ? "Plans changed…" : "§16 — an extraordinary business situation…"
          }
        />
      </div>
      {state.error && <PolicyNote level="BLOCK" title={state.error} />}
      <div className="flex gap-2.5">
        <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost flex-1">
          Keep it
        </button>
        <Pending label={mode === "withdraw" ? "Withdraw" : "Cancel leave"} tone="danger" />
      </div>
    </form>
  );
}
