import { Check, Clock, Minus, X } from "lucide-react";
import { Avatar } from "./ui/primitives";
import { fmtDateTime } from "@/lib/date";

export type TimelineStep = {
  id: string;
  level: number;
  levelLabel: string;
  action: string;
  comment: string;
  actedAt: string | null;
  approver: { name: string; avatarHue: number; designation: string };
};

export type TimelineEvent = {
  label: string;
  at: string;
  by?: { name: string; avatarHue: number };
  note?: string;
};

const ACTION_STYLE: Record<string, { bg: string; fg: string; icon: React.ReactNode; word: string }> = {
  APPROVED: { bg: "var(--c-success)", fg: "#fff", icon: <Check size={12} strokeWidth={3} />, word: "Approved" },
  REJECTED: { bg: "var(--c-danger)", fg: "#fff", icon: <X size={12} strokeWidth={3} />, word: "Rejected" },
  PENDING: { bg: "var(--c-warning)", fg: "#fff", icon: <Clock size={12} strokeWidth={3} />, word: "Waiting" },
  SKIPPED: { bg: "var(--c-ink-200)", fg: "var(--c-ink-500)", icon: <Minus size={12} strokeWidth={3} />, word: "Not required" },
};

/**
 * The approval chain as a vertical connector. §18 asks managers to keep a record of each
 * approval — this is that record, and it is what the audit trail exports.
 */
export function ApprovalTimeline({
  submitted,
  steps,
  closing,
}: {
  submitted: { at: string; by: { name: string; avatarHue: number } };
  steps: TimelineStep[];
  closing?: TimelineEvent;
}) {
  return (
    <ol className="relative">
      <li className="relative flex gap-3.5 pb-6">
        <Connector />
        <span
          className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          style={{ background: "var(--brand-500)", color: "#fff" }}
        >
          <Check size={12} strokeWidth={3} />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-[13px] font-bold" style={{ color: "var(--c-ink-900)" }}>
            Submitted
          </p>
          <div className="mt-1 flex items-center gap-2">
            <Avatar name={submitted.by.name} hue={submitted.by.avatarHue} size={20} />
            <span className="text-[12px]" style={{ color: "var(--c-ink-500)" }}>
              {submitted.by.name} · {fmtDateTime(submitted.at)}
            </span>
          </div>
        </div>
      </li>

      {steps.map((s, i) => {
        const st = ACTION_STYLE[s.action] ?? ACTION_STYLE.PENDING;
        const isLast = i === steps.length - 1 && !closing;
        const pending = s.action === "PENDING";
        return (
          <li key={s.id} className={`relative flex gap-3.5 ${isLast ? "" : "pb-6"}`}>
            {!isLast && <Connector />}
            <span
              className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${pending ? "pulse-dot" : ""}`}
              style={{ background: st.bg, color: st.fg }}
            >
              {st.icon}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-[13px] font-bold" style={{ color: "var(--c-ink-900)" }}>
                {st.word} — {s.levelLabel}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Avatar name={s.approver.name} hue={s.approver.avatarHue} size={20} />
                <span className="text-[12px]" style={{ color: "var(--c-ink-500)" }}>
                  {s.approver.name}
                  {s.actedAt ? ` · ${fmtDateTime(s.actedAt)}` : " · awaiting a decision"}
                </span>
              </div>
              {s.comment && (
                <blockquote
                  className="mt-2 rounded-xl px-3.5 py-2.5 text-[12.5px] leading-relaxed"
                  style={{
                    background: "var(--c-surface-3)",
                    color: "var(--c-ink-700)",
                    borderLeft: `2.5px solid ${st.bg}`,
                  }}
                >
                  {s.comment}
                </blockquote>
              )}
            </div>
          </li>
        );
      })}

      {closing && (
        <li className="relative flex gap-3.5">
          <span
            className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
            style={{ background: "var(--c-ink-200)", color: "var(--c-ink-500)" }}
          >
            <Minus size={12} strokeWidth={3} />
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-[13px] font-bold" style={{ color: "var(--c-ink-900)" }}>
              {closing.label}
            </p>
            <p className="mt-1 text-[12px]" style={{ color: "var(--c-ink-500)" }}>
              {closing.by ? `${closing.by.name} · ` : ""}
              {fmtDateTime(closing.at)}
            </p>
            {closing.note && (
              <blockquote
                className="mt-2 rounded-xl px-3.5 py-2.5 text-[12.5px] leading-relaxed"
                style={{
                  background: "var(--c-surface-3)",
                  color: "var(--c-ink-700)",
                  borderLeft: "2.5px solid var(--c-ink-200)",
                }}
              >
                {closing.note}
              </blockquote>
            )}
          </div>
        </li>
      )}
    </ol>
  );
}

function Connector() {
  return (
    <span
      aria-hidden
      className="absolute left-[13px] top-7 h-[calc(100%-20px)] w-[1.5px]"
      style={{ background: "var(--c-border)" }}
    />
  );
}
