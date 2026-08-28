/**
 * Email-safe building blocks — table-based layout, inline styles only, no external CSS/JS.
 * The visual language mirrors the app's own (see src/app/globals.css): the cyan → violet →
 * magenta "prism arc", the same ink/semantic colours, the same per-leave-type hues. Colours are
 * hardcoded here rather than read from CSS variables because email clients don't resolve them.
 */

export const COLOR = {
  ink900: "#14121f",
  ink700: "#3b3550",
  ink500: "#6b6486",
  ink400: "#928ca8",
  ink200: "#dedbea",
  ink100: "#eceaf4",
  border: "#e4e1ef",
  canvas: "#eeedf7",
  surface2: "#fafafd",
  brand500: "#6c4bf6",
  brand50: "#f2efff",
  success: "#10b981",
  successInk: "#047857",
  successTint: "#e4f8f0",
  warning: "#f59e0b",
  warningInk: "#b45309",
  warningTint: "#fef3e2",
  danger: "#e11d48",
  dangerInk: "#be123c",
  dangerTint: "#ffe4ea",
  info: "#0ea5c4",
  infoInk: "#0e7490",
  infoTint: "#e3f8fd",
} as const;

export const LEAVE_COLOR: Record<string, { ink: string; tint: string; name: string }> = {
  CL: { ink: "#0ea5c4", tint: "#e3f8fd", name: "Casual Leave" },
  SL: { ink: "#f0637d", tint: "#ffe9ee", name: "Sick Leave" },
  PL: { ink: "#6c4bf6", tint: "#eeeaff", name: "Privileged Leave" },
  MATERNITY: { ink: "#c062d9", tint: "#fbebfe", name: "Maternity Leave" },
  PATERNITY: { ink: "#4f7df0", tint: "#e8effe", name: "Paternity Leave" },
  COMP_OFF: { ink: "#10b981", tint: "#e4f8f0", name: "Compensatory Off" },
  LOP: { ink: "#f59e0b", tint: "#fef3e2", name: "Loss of Pay" },
};

const FONT_STACK =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export const APP_URL = "https://leavebase.prismixstudios.in";
const LOGO_URL = `${APP_URL}/icon-192.png`;

/** The header/footer/card frame every email shares. `bodyHtml` is the pre-built inner content. */
export function emailShell(opts: { preheader: string; bodyHtml: string }): string {
  const { preheader, bodyHtml } = opts;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>LeaveBase</title>
</head>
<body style="margin:0;padding:0;background:${COLOR.canvas};font-family:${FONT_STACK};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:${COLOR.canvas};">
  ${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOR.canvas};">
<tr><td align="center" style="padding:36px 16px;">

<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
<tr><td style="background:${COLOR.brand500};background:linear-gradient(90deg,#2fd3f0,#6c4bf6,#c062d9);height:5px;line-height:5px;font-size:0;border-radius:20px 20px 0 0;">&nbsp;</td></tr>
<tr><td style="background:#ffffff;border:1px solid ${COLOR.border};border-top:none;border-radius:0 0 20px 20px;box-shadow:0 2px 4px rgba(20,18,31,0.04),0 20px 44px -14px rgba(20,18,31,0.12);">

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr><td style="padding:30px 36px 6px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="padding-right:9px;vertical-align:middle;">
        <img src="${LOGO_URL}" width="30" height="30" alt="" style="display:block;border-radius:8px;">
      </td>
      <td style="vertical-align:middle;font-size:17px;font-weight:800;letter-spacing:-0.02em;font-family:${FONT_STACK};">
        <span style="color:${COLOR.ink900};">Leave</span><span style="color:${COLOR.brand500};">Base</span>
      </td>
    </tr></table>
  </td></tr>
  </table>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr><td style="padding:14px 36px 34px;">
    ${bodyHtml}
  </td></tr>
  </table>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr><td style="padding:18px 36px;background:${COLOR.surface2};border-top:1px solid ${COLOR.ink100};border-radius:0 0 20px 20px;">
    <p style="margin:0;font-size:11px;line-height:1.7;color:${COLOR.ink400};font-family:${FONT_STACK};">
      Automated message from <strong style="color:${COLOR.ink500};">LeaveBase</strong> — Prismix Studios' leave
      management system. Questions about a decision? Reach out to HR directly rather than replying to this email.
    </p>
  </td></tr>
  </table>

</td></tr>
</table>

</td></tr>
</table>
</body>
</html>`;
}

export function heading(text: string): string {
  return `<h1 style="margin:0 0 6px;font-size:20px;line-height:1.3;font-weight:800;letter-spacing:-0.01em;color:${COLOR.ink900};font-family:${FONT_STACK};">${text}</h1>`;
}

export function lede(html: string): string {
  return `<p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:${COLOR.ink700};font-family:${FONT_STACK};">${html}</p>`;
}

export function paragraph(html: string, opts: { muted?: boolean; marginTop?: number } = {}): string {
  const color = opts.muted ? COLOR.ink500 : COLOR.ink700;
  return `<p style="margin:${opts.marginTop ?? 0}px 0 0;font-size:13px;line-height:1.65;color:${color};font-family:${FONT_STACK};">${html}</p>`;
}

export function badge(label: string, tone: "success" | "danger" | "warning" | "info" | "brand"): string {
  const tones: Record<string, { bg: string; fg: string }> = {
    success: { bg: COLOR.successTint, fg: COLOR.successInk },
    danger: { bg: COLOR.dangerTint, fg: COLOR.dangerInk },
    warning: { bg: COLOR.warningTint, fg: COLOR.warningInk },
    info: { bg: COLOR.infoTint, fg: COLOR.infoInk },
    brand: { bg: COLOR.brand50, fg: COLOR.brand500 },
  };
  const t = tones[tone];
  return `<span style="display:inline-block;padding:4px 12px;border-radius:999px;font-size:10.5px;font-weight:800;letter-spacing:0.05em;text-transform:uppercase;background:${t.bg};color:${t.fg};font-family:${FONT_STACK};">${label}</span>`;
}

/** A rounded card wrapping arbitrary inner HTML, tinted per leave type or neutral. */
export function card(innerHtml: string, opts: { tint?: string; border?: string } = {}): string {
  const bg = opts.tint ?? COLOR.surface2;
  const border = opts.border ?? COLOR.border;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;background:${bg};border:1px solid ${border};border-radius:14px;">
<tr><td style="padding:16px 18px;">${innerHtml}</td></tr>
</table>`;
}

/** Label/value rows, e.g. Dates, Duration, Reason. */
export function detailRows(rows: Array<[string, string]>): string {
  const trs = rows
    .map(
      ([label, value], i) => `<tr>
  <td style="padding:8px 0;${i > 0 ? `border-top:1px solid ${COLOR.ink100};` : ""}font-size:12px;font-weight:700;color:${COLOR.ink400};font-family:${FONT_STACK};vertical-align:top;width:36%;">${label}</td>
  <td style="padding:8px 0;${i > 0 ? `border-top:1px solid ${COLOR.ink100};` : ""}font-size:13px;font-weight:700;color:${COLOR.ink900};font-family:${FONT_STACK};text-align:right;vertical-align:top;">${value}</td>
</tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${trs}</table>`;
}

/** One leave type's before → after balance, as a compact row with a coloured dot. */
export function balanceRow(type: string, availableBefore: number, availableAfter?: number): string {
  const meta = LEAVE_COLOR[type] ?? { ink: COLOR.ink500, tint: COLOR.ink100, name: type };
  const changed = availableAfter !== undefined && availableAfter !== availableBefore;
  return `<tr>
  <td style="padding:7px 0;font-size:12.5px;font-family:${FONT_STACK};" width="55%">
    <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${meta.ink};margin-right:7px;"></span>
    <span style="color:${COLOR.ink700};font-weight:600;">${meta.name}</span>
  </td>
  <td style="padding:7px 0;font-size:13px;font-weight:800;color:${COLOR.ink900};text-align:right;font-family:${FONT_STACK};">
    ${fmtDaysHtml(availableBefore)}${changed ? ` <span style="color:${COLOR.ink400};font-weight:600;">&rarr;</span> <span style="color:${meta.ink};">${fmtDaysHtml(availableAfter as number)}</span>` : ""}
  </td>
</tr>`;
}

export function balanceTable(rowsHtml: string, title = "Balance"): string {
  return card(
    `<p style="margin:0 0 8px;font-size:11px;font-weight:800;letter-spacing:0.05em;text-transform:uppercase;color:${COLOR.ink400};font-family:${FONT_STACK};">${title}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>`,
  );
}

export function ctaButton(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;"><tr>
<td style="border-radius:11px;background:${COLOR.brand500};">
  <a href="${url}" style="display:inline-block;padding:12px 22px;font-size:13px;font-weight:800;color:#ffffff;text-decoration:none;border-radius:11px;font-family:${FONT_STACK};">${label} &rarr;</a>
</td>
</tr></table>`;
}

export function calloutWarn(html: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;background:${COLOR.warningTint};border-radius:12px;">
<tr><td style="padding:13px 16px;font-size:12.5px;line-height:1.55;color:${COLOR.warningInk};font-family:${FONT_STACK};">${html}</td></tr>
</table>`;
}

export function fmtDaysHtml(n: number): string {
  const s = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return `${s}${n === 1 ? " day" : " days"}`;
}
