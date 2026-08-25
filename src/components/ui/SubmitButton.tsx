"use client";

import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";

/**
 * A submit button that always reports progress.
 *
 * `useFormStatus` only returns a pending state when it is called from a component rendered *inside*
 * the <form> — calling it in the same component that renders the form always yields false. Putting
 * it behind this component makes that impossible to get wrong, which is why every form in the app
 * uses it rather than its own button.
 */
export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  className = "",
  style,
  disabled,
  onClick,
  icon,
  full,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "ghost" | "danger" | "success" | "quiet";
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
  onClick?: () => void;
  icon?: React.ReactNode;
  full?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      onClick={onClick}
      disabled={pending || disabled}
      aria-busy={pending}
      className={`btn btn-${variant} ${full ? "w-full" : ""} ${className}`}
      style={style}
    >
      {pending ? <Loader2 size={14} className="animate-spin" /> : icon}
      {pending ? (pendingLabel ?? "Working…") : children}
    </button>
  );
}

/**
 * Dims and blocks a form while it is submitting, so a slow round trip reads as "in progress"
 * rather than "nothing happened".
 */
export function PendingOverlay({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <div
      style={{
        opacity: pending ? 0.55 : 1,
        pointerEvents: pending ? "none" : undefined,
        transition: "opacity 160ms ease",
      }}
    >
      {children}
    </div>
  );
}
