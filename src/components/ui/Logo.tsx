/**
 * The Prismix mark, rebuilt as vector so it stays crisp at 24px in the sidebar and can carry the
 * brand gradient into the UI. The source PNG is used for the full lockup on the sign-in screen.
 *
 * Geometry follows the original: a spectrum ring travelling cyan → blue → violet → magenta around
 * a black core, with a rounded triangle and a centred circle inside it.
 */
export function PrismixMark({ size = 32, id = "pm" }: { size?: number; id?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden>
      <defs>
        <linearGradient id={`${id}-ring`} x1="18" y1="10" x2="82" y2="92" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1E7FC4" />
          <stop offset="38%" stopColor="#2C5FC7" />
          <stop offset="68%" stopColor="#7C4DBE" />
          <stop offset="100%" stopColor="#C062D9" />
        </linearGradient>
        <linearGradient id={`${id}-tri`} x1="30" y1="24" x2="72" y2="76" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#5EE0FA" />
          <stop offset="45%" stopColor="#57B7F0" />
          <stop offset="100%" stopColor="#B983E4" />
        </linearGradient>
      </defs>

      {/* spectrum ring */}
      <circle cx="50" cy="50" r="45" stroke={`url(#${id}-ring)`} strokeWidth="5.5" />
      {/* the bright arc highlight at the upper left of the original mark */}
      <path
        d="M 17 68 A 40 40 0 0 1 33 15"
        stroke="#8FD3F4"
        strokeWidth="3.2"
        strokeLinecap="round"
        fill="none"
        opacity="0.95"
      />
      {/* the small node sitting on the ring */}
      <circle cx="17.5" cy="74" r="4.6" fill="#2C74C7" />
      <circle cx="17.5" cy="74" r="1.9" fill="#0B0A14" />

      {/* black core */}
      <circle cx="50" cy="50" r="38.5" fill="#0B0A14" />

      {/* rounded triangle */}
      <path
        d="M50 25.5 L71.5 64 Q73.5 68 69 68 L31 68 Q26.5 68 28.5 64 Z"
        stroke={`url(#${id}-tri)`}
        strokeWidth="3.4"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="50" cy="55" r="7.4" stroke="#E8F6FF" strokeWidth="1.5" fill="none" opacity="0.92" />
    </svg>
  );
}

/** Mark + wordmark, for the sidebar header and page headers. */
export function LeaveBaseLogo({
  size = 32,
  showWord = true,
  id = "lb",
}: {
  size?: number;
  showWord?: boolean;
  id?: string;
}) {
  return (
    <span className="flex items-center gap-2.5">
      <PrismixMark size={size} id={id} />
      {showWord && (
        <span className="flex flex-col leading-none">
          <span
            className="text-[16px] font-extrabold tracking-[-0.03em]"
            style={{ color: "var(--c-ink-900)" }}
          >
            Leave<span className="text-gradient">Base</span>
          </span>
          <span
            className="mt-[3px] text-[9px] font-bold uppercase tracking-[0.14em]"
            style={{ color: "var(--c-ink-400)" }}
          >
            Prismix Studios
          </span>
        </span>
      )}
    </span>
  );
}
