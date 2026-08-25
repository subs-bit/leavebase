import { fmtDays } from "@/lib/date";

/**
 * The hero object of the product.
 *
 * A leave balance is fundamentally a proportion of a fixed grant, so it gets a ring rather than
 * the generic progress bar of the reference designs. The ring draws itself on mount — the one
 * piece of delight the product allows itself.
 */
export function BalanceRing({
  available,
  granted,
  color,
  label,
  sublabel,
  size = 132,
  stroke = 10,
  delay = 0,
  annualEntitlement,
}: {
  available: number;
  /** Credited so far this year — the ring's denominator. Grows every quarter (§7). */
  granted: number;
  color: string;
  label: string;
  sublabel?: string;
  size?: number;
  stroke?: number;
  delay?: number;
  /**
   * The full-year grant, once every quarter has credited. When it's ahead of `granted`, the
   * caption spells out why the ring reads less than the headline entitlement — otherwise "3 of 3"
   * reads as "your entitlement is 3", which it isn't.
   */
  annualEntitlement?: number;
}) {
  const r = (size - stroke) / 2 - 2;
  const circ = 2 * Math.PI * r;
  const used = Math.max(0, granted - available);
  const pct = granted <= 0 ? 0 : Math.min(1, Math.max(0, available / granted));
  const dash = circ * pct;
  const cx = size / 2;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
          aria-hidden
        >
          <circle
            cx={cx} cy={cx} r={r}
            fill="none"
            stroke="var(--ring-track)"
            strokeWidth={stroke}
          />
          <circle
            cx={cx} cy={cx} r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circ - dash}`}
            style={{
              // @ts-expect-error — custom property consumed by the ring-draw keyframes
              "--dash-full": `${circ}px`,
              animation: `ring-draw 900ms cubic-bezier(.32,.72,0,1) ${delay}ms both`,
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="stat" style={{ fontSize: size * 0.26 }}>
            {fmtDays(available)}
          </span>
          <span
            className="mt-0.5 text-[11px] font-bold"
            style={{ color: "var(--c-ink-400)" }}
          >
            of {fmtDays(granted)}
          </span>
        </div>
      </div>
      <p className="mt-3 text-[13px] font-bold" style={{ color: "var(--c-ink-900)" }}>
        {label}
      </p>
      <p className="mt-0.5 text-[11.5px]" style={{ color: "var(--c-ink-500)" }}>
        {sublabel ?? `${fmtDays(used)} used`}
      </p>
      {/* Quarterly accrual (§7) means the ring's "of N" is what's credited so far, not the full
          year's grant — spell that out, or "3 of 3" reads as a 3-day entitlement. */}
      {annualEntitlement !== undefined && annualEntitlement > granted && (
        <p className="mt-0.5 text-[10.5px]" style={{ color: "var(--c-ink-400)" }}>
          {fmtDays(annualEntitlement)} for the year, credited quarterly
        </p>
      )}
    </div>
  );
}

/** Compact horizontal variant for dense lists (team view, employee drawer, statement). */
export function BalanceBar({
  available, granted, color, label, annualEntitlement,
}: {
  available: number;
  /** Credited so far this year — see BalanceRing for why this can be less than the annual grant. */
  granted: number;
  color: string;
  label: string;
  annualEntitlement?: number;
}) {
  const pct = granted <= 0 ? 0 : Math.min(100, (available / granted) * 100);
  const showAnnual = annualEntitlement !== undefined && annualEntitlement > granted;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-bold" style={{ color: "var(--c-ink-700)" }}>{label}</span>
        <span className="text-[12px] font-bold tnum" style={{ color: "var(--c-ink-900)" }}>
          {fmtDays(available)}
          <span style={{ color: "var(--c-ink-400)" }}>
            {" "}/ {fmtDays(granted)}{showAnnual ? ` credited` : ""}
          </span>
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--ring-track)" }}>
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      {showAnnual && (
        <p className="mt-1 text-[10.5px]" style={{ color: "var(--c-ink-400)" }}>
          {fmtDays(annualEntitlement)} for the year, credited quarterly (§7)
        </p>
      )}
    </div>
  );
}
