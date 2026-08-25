import { fmtDays } from "@/lib/date";

/**
 * Charts are hand-built SVG rather than a library so they inherit the design system's colour
 * tokens exactly and stay legible in both themes.
 */

export type Slice = { label: string; value: number; color: string };

export function Donut({
  slices, size = 168, thickness = 22, centerLabel, centerValue,
}: {
  slices: Slice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2 - 2;
  const circ = 2 * Math.PI * r;
  const c = size / 2;

  let offset = 0;
  const arcs = slices
    .filter((s) => s.value > 0)
    .map((s) => {
      const frac = total > 0 ? s.value / total : 0;
      const dash = circ * frac;
      const arc = { ...s, dash, gap: circ - dash, offset: -offset };
      offset += dash;
      return arc;
    });

  return (
    <div className="flex items-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={c} cy={c} r={r} fill="none" stroke="var(--ring-track)" strokeWidth={thickness} />
          {arcs.map((a, i) => (
            <circle
              key={i}
              cx={c} cy={c} r={r}
              fill="none"
              stroke={a.color}
              strokeWidth={thickness}
              strokeDasharray={`${a.dash} ${a.gap}`}
              strokeDashoffset={a.offset}
            />
          ))}
        </svg>
        {(centerValue || centerLabel) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {centerValue && (
              <span className="stat" style={{ fontSize: size * 0.2 }}>{centerValue}</span>
            )}
            {centerLabel && (
              <span className="mt-0.5 text-[10.5px] font-bold" style={{ color: "var(--c-ink-400)" }}>
                {centerLabel}
              </span>
            )}
          </div>
        )}
      </div>

      <ul className="min-w-0 flex-1 space-y-2">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold" style={{ color: "var(--c-ink-700)" }}>
              {s.label}
            </span>
            <span className="shrink-0 text-[12.5px] font-extrabold tnum" style={{ color: "var(--c-ink-900)" }}>
              {fmtDays(s.value)}
            </span>
            <span className="w-10 shrink-0 text-right text-[11px] tnum" style={{ color: "var(--c-ink-400)" }}>
              {total > 0 ? Math.round((s.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type Bar = { label: string; value: number; color?: string; sub?: string };

export function BarChart({
  bars, max, height = 150, unit = "days",
}: {
  bars: Bar[];
  max?: number;
  height?: number;
  unit?: string;
}) {
  const top = max ?? Math.max(1, ...bars.map((b) => b.value));
  return (
    <div>
      <div className="flex items-end gap-2" style={{ height }}>
        {bars.map((b) => {
          const h = top > 0 ? Math.max(3, (b.value / top) * (height - 26)) : 3;
          return (
            <div key={b.label} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
              <span className="text-[11px] font-extrabold tnum" style={{ color: "var(--c-ink-700)" }}>
                {b.value > 0 ? fmtDays(b.value) : ""}
              </span>
              <div
                className="w-full rounded-t-lg transition-[height] duration-700 ease-out"
                style={{
                  height: h,
                  background: b.color ?? "var(--brand-400)",
                  minWidth: 8,
                }}
                title={`${b.label}: ${fmtDays(b.value)} ${unit}`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2">
        {bars.map((b) => (
          <span
            key={b.label}
            className="min-w-0 flex-1 truncate text-center text-[10.5px] font-bold"
            style={{ color: "var(--c-ink-400)" }}
            title={b.label}
          >
            {b.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Horizontal ranked bars — better than a vertical chart when labels are names. */
export function RankedBars({ bars, unit = "days" }: { bars: Bar[]; unit?: string }) {
  const top = Math.max(1, ...bars.map((b) => b.value));
  // "1 day", not "1 days" — the unit agrees with the number it follows.
  const unitFor = (v: number) =>
    unit === "days" && Math.abs(v) === 1 ? "day" : unit;
  return (
    <ul className="space-y-3">
      {bars.map((b) => (
        <li key={b.label}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-[12.5px] font-bold" style={{ color: "var(--c-ink-900)" }}>
              {b.label}
            </span>
            <span className="shrink-0 text-[12px] font-extrabold tnum" style={{ color: "var(--c-ink-700)" }}>
              {fmtDays(b.value)}
              <span className="ml-1 font-semibold" style={{ color: "var(--c-ink-400)" }}>
                {unitFor(b.value)}
              </span>
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--ring-track)" }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${(b.value / top) * 100}%`, background: b.color ?? "var(--brand-500)" }}
            />
          </div>
          {b.sub && (
            <p className="mt-1 text-[11px]" style={{ color: "var(--c-ink-400)" }}>{b.sub}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
