import { ReactNode } from "react";
import { LEAVE_META, STATUS_LABEL } from "@/lib/policy/types";
import type { LeaveType } from "@/lib/policy/types";

// ── leave-type colour access ──────────────────────────────────────────────────

export function leaveInk(type: string): string {
  const t = LEAVE_META[type as LeaveType]?.token ?? "lop";
  return `var(--lt-${t})`;
}
export function leaveTint(type: string): string {
  const t = LEAVE_META[type as LeaveType]?.token ?? "lop";
  return `var(--lt-${t}-tint)`;
}
export function leaveName(type: string): string {
  return LEAVE_META[type as LeaveType]?.name ?? type;
}
export function leaveShort(type: string): string {
  return LEAVE_META[type as LeaveType]?.short ?? type;
}

// ── chips ─────────────────────────────────────────────────────────────────────

export function LeaveChip({ type, size = "md" }: { type: string; size?: "sm" | "md" }) {
  return (
    <span
      className="chip"
      style={{
        background: leaveTint(type),
        color: leaveInk(type),
        fontSize: size === "sm" ? 10.5 : 11.5,
        padding: size === "sm" ? "3px 8px" : "4px 10px",
      }}
    >
      <span
        className="inline-block rounded-full"
        style={{ width: 6, height: 6, background: leaveInk(type) }}
      />
      {leaveName(type)}
    </span>
  );
}

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  PENDING: { bg: "var(--c-warning-tint)", fg: "var(--c-warning-ink)" },
  PENDING_HOD: { bg: "var(--lt-pl-tint)", fg: "var(--lt-pl)" },
  APPROVED: { bg: "var(--c-success-tint)", fg: "var(--c-success-ink)" },
  REJECTED: { bg: "var(--c-danger-tint)", fg: "var(--c-danger-ink)" },
  CANCELLED: { bg: "var(--c-neutral-tint)", fg: "var(--c-neutral-ink)" },
  WITHDRAWN: { bg: "var(--c-neutral-tint)", fg: "var(--c-neutral-ink)" },
  EXPIRED: { bg: "var(--c-warning-tint)", fg: "var(--c-warning-ink)" },
  CONSUMED: { bg: "var(--c-neutral-tint)", fg: "var(--c-neutral-ink)" },
};

/** Status is never communicated by colour alone — the label always rides along. */
export function StatusChip({ status, size = "md" }: { status: string; size?: "sm" | "md" }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.CANCELLED;
  const pending = status === "PENDING" || status === "PENDING_HOD";
  return (
    <span
      className="chip"
      style={{
        background: s.bg,
        color: s.fg,
        fontSize: size === "sm" ? 10.5 : 11.5,
        padding: size === "sm" ? "3px 8px" : "4px 10px",
      }}
    >
      <span
        className={`inline-block rounded-full ${pending ? "pulse-dot" : ""}`}
        style={{ width: 6, height: 6, background: s.fg }}
      />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function Chip({
  children, tone = "neutral", size = "md",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info" | "brand";
  size?: "sm" | "md";
}) {
  const tones: Record<string, { bg: string; fg: string }> = {
    neutral: { bg: "var(--c-ink-100)", fg: "var(--c-ink-500)" },
    success: { bg: "var(--c-success-tint)", fg: "var(--c-success-ink)" },
    warning: { bg: "var(--c-warning-tint)", fg: "var(--c-warning-ink)" },
    danger: { bg: "var(--c-danger-tint)", fg: "var(--c-danger-ink)" },
    info: { bg: "var(--c-info-tint)", fg: "var(--c-info-ink)" },
    brand: { bg: "var(--lt-pl-tint)", fg: "var(--lt-pl)" },
  };
  const t = tones[tone];
  return (
    <span
      className="chip"
      style={{
        background: t.bg, color: t.fg,
        fontSize: size === "sm" ? 10.5 : 11.5,
        padding: size === "sm" ? "3px 8px" : "4px 10px",
      }}
    >
      {children}
    </span>
  );
}

// ── avatar ────────────────────────────────────────────────────────────────────

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
  name, hue = 260, size = 36, ring = false,
}: {
  name: string;
  hue?: number;
  size?: number;
  ring?: boolean;
}) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold select-none"
      title={name}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        letterSpacing: "0.01em",
        color: `hsl(${hue} 62% 32%)`,
        background: `linear-gradient(140deg, hsl(${hue} 86% 92%), hsl(${(hue + 40) % 360} 82% 87%))`,
        boxShadow: ring ? `0 0 0 2px var(--c-surface), 0 0 0 3.5px hsl(${hue} 70% 78%)` : undefined,
      }}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({
  people, size = 26, max = 3,
}: {
  people: { name: string; avatarHue?: number }[];
  size?: number;
  max?: number;
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span className="flex items-center">
      {shown.map((p, i) => (
        <span key={i} style={{ marginLeft: i === 0 ? 0 : -size * 0.32, zIndex: max - i }}>
          <Avatar name={p.name} hue={p.avatarHue ?? 260} size={size} ring />
        </span>
      ))}
      {rest > 0 && (
        <span
          className="inline-flex items-center justify-center rounded-full font-bold"
          style={{
            width: size, height: size, fontSize: size * 0.34,
            marginLeft: -size * 0.32,
            background: "var(--c-ink-100)", color: "var(--c-ink-500)",
            boxShadow: "0 0 0 2px var(--c-surface)",
          }}
        >
          +{rest}
        </span>
      )}
    </span>
  );
}

// ── structure ─────────────────────────────────────────────────────────────────

export function SectionHeader({
  eyebrow, title, action, className = "",
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-end justify-between gap-4 ${className}`}>
      <div>
        {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
        <h2 className="text-[17px]">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon, title, body, action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && (
        <div
          className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{ background: "var(--c-ink-100)", color: "var(--c-ink-400)" }}
        >
          {icon}
        </div>
      )}
      <p className="text-[15px] font-bold" style={{ color: "var(--c-ink-900)" }}>{title}</p>
      {body && (
        <p className="mt-1.5 max-w-sm text-[13px]" style={{ color: "var(--c-ink-500)" }}>{body}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ── policy note ───────────────────────────────────────────────────────────────

const NOTE_TONE: Record<string, { bg: string; fg: string; border: string }> = {
  BLOCK: { bg: "var(--c-danger-tint)", fg: "var(--c-danger-ink)", border: "color-mix(in srgb, var(--c-danger) 26%, transparent)" },
  WARN: { bg: "var(--c-warning-tint)", fg: "var(--c-warning-ink)", border: "color-mix(in srgb, var(--c-warning) 30%, transparent)" },
  INFO: { bg: "var(--c-info-tint)", fg: "var(--c-info-ink)", border: "color-mix(in srgb, var(--c-info) 26%, transparent)" },
};

/**
 * The product's soul: never just "not allowed" — always what the rule is and where it comes from.
 */
export function PolicyNote({
  level = "INFO", title, children, clause,
}: {
  level?: "BLOCK" | "WARN" | "INFO";
  title: string;
  children?: ReactNode;
  clause?: string;
}) {
  const t = NOTE_TONE[level];
  return (
    <div className="policy-note" style={{ background: t.bg, borderColor: t.border }}>
      <div className="flex items-start gap-2.5">
        <span
          className="mt-[5px] inline-block shrink-0 rounded-full"
          style={{ width: 7, height: 7, background: t.fg }}
        />
        <div className="min-w-0 flex-1">
          <p className="font-bold" style={{ color: t.fg }}>
            {title}
            {clause && (
              <span
                className="ml-2 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold"
                style={{ background: "color-mix(in srgb, currentColor 14%, transparent)" }}
              >
                {clause}
              </span>
            )}
          </p>
          {children && (
            <div className="mt-1" style={{ color: "var(--c-ink-700)" }}>{children}</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── bars ──────────────────────────────────────────────────────────────────────

export function Progress({
  value, max, color, height = 6,
}: {
  value: number;
  max: number;
  color?: string;
  height?: number;
}) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div
      className="w-full overflow-hidden rounded-full"
      style={{ height, background: "var(--ring-track)" }}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemax={max}
    >
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${pct}%`, background: color ?? "var(--brand-500)" }}
      />
    </div>
  );
}
