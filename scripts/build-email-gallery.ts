/** Builds a self-contained review-gallery HTML page embedding every email preview. */
import { writeFileSync } from "node:fs";
import {
  leaveSubmittedToApproverEmail, leaveSubmittedToApplicantEmail, leaveDecisionEmail,
  leaveCancelledEmail, newEmployeeWelcomeEmail, firstLoginWelcomeEmail, firstLoginTeamEmail,
  passwordResetEmail, passwordChangedEmail, compOffClaimedEmail, compOffDecisionEmail,
  compOffExpiringEmail, employeeConfirmedEmail, absenceFlaggedEmail, balanceAdjustedEmail,
  accrualPostedEmail,
} from "../src/lib/email/templates";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The real templates reference the hosted production logo, which is correct for real email —
// but the artifact preview sandbox blocks remote images, so swap in a data URI for preview only.
const LOGO_URL = "https://leavebase.prismixstudios.in/icon-192.png";
const logoDataUri = (() => {
  const bytes = readFileSync(join(__dirname, "..", "public", "icon-192.png"));
  return `data:image/png;base64,${bytes.toString("base64")}`;
})();
const forPreview = (html: string) => html.split(LOGO_URL).join(logoDataUri);

const outFile = process.argv[2];
if (!outFile) throw new Error("usage: build-email-gallery.ts <outFile>");

type Item = { id: string; group: string; label: string; subject: string; to: string; html: string };

const items: Item[] = [
  {
    id: "01", group: "Leave request", label: "New request — to approver", to: "Neha Bhat (Reporting Manager)",
    ...leaveSubmittedToApproverEmail({
      approverFirstName: "Neha", applicantName: "Aryan Gupta", applicantDesignation: "Pipeline Engineer",
      leaveTypeCode: "PL", dateRange: "14–17 Sep 2026", days: 4,
      reason: "Cousin's wedding — travelling out of town.", noticeDays: 22,
      balanceOnDate: [{ type: "PL", before: 12.5, after: 8.5 }], lopDays: 0, requestId: "sample",
    }),
  },
  {
    id: "02", group: "Leave request", label: "New request — LOP + escalation", to: "Neha Bhat (Reporting Manager)",
    ...leaveSubmittedToApproverEmail({
      approverFirstName: "Neha", applicantName: "Meera Iyer", applicantDesignation: "3D Artist",
      leaveTypeCode: "PL", dateRange: "1–6 Oct 2026", days: 5,
      reason: "Family function back home.", noticeDays: 12,
      balanceOnDate: [{ type: "PL", before: 3, after: 0 }], lopDays: 2,
      extraApprover: "Vatsal Sheth (Head of Department)",
      warnings: ["4 other people on the Production team are already away in this window — coverage may be tight."],
      requestId: "sample",
    }),
  },
  {
    id: "03", group: "Leave request", label: "New request — to applicant", to: "Aryan Gupta",
    ...leaveSubmittedToApplicantEmail({
      applicantFirstName: "Aryan", leaveTypeCode: "PL", dateRange: "14–17 Sep 2026", days: 4,
      reason: "Cousin's wedding — travelling out of town.", approverName: "Neha Bhat",
      balance: [{ type: "PL", before: 12.5, after: 8.5 }], lopDays: 0, requestId: "sample",
    }),
  },
  {
    id: "04", group: "Decision", label: "Approved — to applicant", to: "Aryan Gupta",
    ...leaveDecisionEmail({
      recipientFirstName: "Aryan", isApplicant: true, applicantName: "Aryan Gupta", decision: "APPROVED",
      deciderName: "Neha Bhat", leaveTypeCode: "PL", dateRange: "14–17 Sep 2026", days: 4,
      comment: "Enjoy the wedding!", balance: [{ type: "PL", before: 12.5, after: 8.5 }], requestId: "sample",
    }),
  },
  {
    id: "05", group: "Decision", label: "Approved — to admin/founder copy", to: "Vatsal Sheth (Administrator)",
    ...leaveDecisionEmail({
      recipientFirstName: "Vatsal", isApplicant: false, applicantName: "Aryan Gupta", decision: "APPROVED",
      deciderName: "Neha Bhat", leaveTypeCode: "PL", dateRange: "14–17 Sep 2026", days: 4,
      balance: [{ type: "PL", before: 12.5, after: 8.5 }], requestId: "sample",
    }),
  },
  {
    id: "06", group: "Decision", label: "Rejected — to applicant", to: "Meera Iyer",
    ...leaveDecisionEmail({
      recipientFirstName: "Meera", isApplicant: true, applicantName: "Meera Iyer", decision: "REJECTED",
      deciderName: "Vatsal Sheth", leaveTypeCode: "PL", dateRange: "1–6 Oct 2026", days: 5,
      comment: "Too much overlap with the Diwali crunch — let's revisit dates after the deadline.",
      balance: [{ type: "PL", before: 3 }], requestId: "sample",
    }),
  },
  {
    id: "07", group: "Decision", label: "Cancelled", to: "Aryan Gupta",
    ...leaveCancelledEmail({
      recipientFirstName: "Aryan", isApplicant: true, applicantName: "Aryan Gupta", actorName: "Neha Bhat",
      leaveTypeCode: "PL", dateRange: "14–17 Sep 2026", days: 4,
      reason: "An urgent client review moved into this window.",
      balance: [{ type: "PL", before: 8.5, after: 12.5 }], requestId: "sample",
    }),
  },
  {
    id: "08", group: "Account", label: "New employee — welcome + set-password link", to: "Kabir Shah",
    ...newEmployeeWelcomeEmail({
      firstName: "Kabir", email: "kabir.shah@prismixstudios.com",
      activationUrl: "https://leavebase.prismixstudios.in/activate/sample-token",
      designation: "Compositor", expiresInHours: 48,
    }),
  },
  {
    id: "09", group: "Account", label: "First login — welcome", to: "Kabir Shah",
    ...firstLoginWelcomeEmail({ firstName: "Kabir" }),
  },
  {
    id: "10", group: "Account", label: "First login — to admin/founder/manager", to: "Vatsal Sheth (Administrator)",
    ...firstLoginTeamEmail({
      recipientFirstName: "Vatsal", employeeName: "Kabir Shah", designation: "Compositor",
      department: "Technology", employeeId: "sample",
    }),
  },
  {
    id: "11", group: "Account", label: "Password reset — set-password link", to: "Aryan Gupta",
    ...passwordResetEmail({
      firstName: "Aryan", email: "aryan.gupta@prismixstudios.com",
      resetUrl: "https://leavebase.prismixstudios.in/reset/sample-token",
      actorName: "Ashish Parpani", expiresInHours: 2,
    }),
  },
  {
    id: "12", group: "Account", label: "Password changed (confirmation)", to: "Aryan Gupta",
    ...passwordChangedEmail({ firstName: "Aryan", when: "28 Aug 2026, 4:12 PM" }),
  },
  {
    id: "13", group: "Comp-off", label: "Claimed — to approver", to: "Neha Bhat (Reporting Manager)",
    ...compOffClaimedEmail({
      approverFirstName: "Neha", employeeName: "Aryan Gupta", workedDate: "9 Aug 2026",
      workedDayLabel: "a declared holiday", expiresDate: "29 Aug 2026", claimId: "sample",
    }),
  },
  {
    id: "14", group: "Comp-off", label: "Approved — to employee", to: "Aryan Gupta",
    ...compOffDecisionEmail({
      employeeFirstName: "Aryan", decision: "APPROVED", deciderName: "Neha Bhat",
      workedDate: "9 Aug 2026", expiresDate: "29 Aug 2026",
    }),
  },
  {
    id: "15", group: "Comp-off", label: "Expiring soon", to: "Aryan Gupta",
    ...compOffExpiringEmail({
      employeeFirstName: "Aryan", count: 1, workedDate: "9 Aug 2026",
      expiresDate: "29 Aug 2026", daysLeft: 3,
    }),
  },
  {
    id: "16", group: "Employment", label: "Employee confirmed", to: "Meera Iyer",
    ...employeeConfirmedEmail({
      employeeFirstName: "Meera", confirmDate: "1 Sep 2026",
      balance: [{ type: "CL", before: 3 }, { type: "SL", before: 3 }, { type: "PL", before: 0 }],
    }),
  },
  {
    id: "17", group: "Absence (§12)", label: "Warning", to: "Ashish Parpani (HR)",
    ...absenceFlaggedEmail({
      recipientFirstName: "Ashish", employeeName: "Rohan Vats", severity: "WARNING",
      workingDays: 4, dateRange: "24–27 Aug 2026", abscondingThreshold: 7, employeeId: "sample",
    }),
  },
  {
    id: "18", group: "Absence (§12)", label: "Absconding threshold reached", to: "Ashish Parpani (HR)",
    ...absenceFlaggedEmail({
      recipientFirstName: "Ashish", employeeName: "Rohan Vats", severity: "ABSCONDING",
      workingDays: 8, dateRange: "20–29 Aug 2026", abscondingThreshold: 7, employeeId: "sample",
    }),
  },
  {
    id: "19", group: "HR corrections", label: "Balance manually adjusted", to: "Aryan Gupta",
    ...balanceAdjustedEmail({
      employeeFirstName: "Aryan", actorName: "Ashish Parpani", leaveTypeCode: "SL", amount: 2,
      note: "Carried over from previous HR system at onboarding.",
      balance: [{ type: "SL", before: 4.5, after: 6.5 }],
    }),
  },
  {
    id: "20", group: "HR corrections", label: "Quarterly accrual posted", to: "Aryan Gupta",
    ...accrualPostedEmail({
      employeeFirstName: "Aryan", periodLabel: "Q2", leaveYearLabel: "2026-27",
      balance: [{ type: "CL", before: 3 }, { type: "SL", before: 3 }, { type: "PL", before: 7.5 }],
    }),
  },
].map((item) => ({ ...item, html: forPreview(item.html) }));

const dataJson = JSON.stringify(items);

const groups = [...new Set(items.map((i) => i.group))];
const navHtml = groups
  .map(
    (g) => `
    <div class="nav-group">
      <p class="nav-group-label">${g}</p>
      ${items
        .filter((i) => i.group === g)
        .map(
          (i) => `<button class="nav-item" data-id="${i.id}" type="button">
        <span class="nav-item-label">${i.label}</span>
        <span class="nav-item-to">${i.to}</span>
      </button>`,
        )
        .join("\n")}
    </div>`,
  )
  .join("\n");

const html = `<title>Email Drafts</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&display=swap');

  :root{
    --ink-900:#14121f; --ink-700:#3b3550; --ink-500:#6b6486; --ink-400:#928ca8;
    --ink-200:#dedbea; --ink-100:#eceaf4; --ink-50:#f5f4fa;
    --canvas:#eeedf7; --surface:#ffffff; --surface-2:#fafafd; --border:#e4e1ef;
    --brand-500:#6c4bf6; --brand-50:#f2efff;
    --mono: 'SF Mono', ui-monospace, Consolas, monospace;
    --sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    --display: 'Manrope', var(--sans);
  }
  :root:not([data-theme="light"]) { }
  @media (prefers-color-scheme: dark){
    :root:not([data-theme="light"]){
      --ink-900:#f4f2ff; --ink-700:#c9c4e0; --ink-500:#948da8; --ink-400:#776f92;
      --ink-200:#2f2b47; --ink-100:#241f38; --ink-50:#1e1a2e;
      --canvas:#0b0a14; --surface:#161420; --surface-2:#1b1830; --border:#2b2740;
      --brand-50:#241d47;
    }
  }
  :root[data-theme="dark"]{
    --ink-900:#f4f2ff; --ink-700:#c9c4e0; --ink-500:#948da8; --ink-400:#776f92;
    --ink-200:#2f2b47; --ink-100:#241f38; --ink-50:#1e1a2e;
    --canvas:#0b0a14; --surface:#161420; --surface-2:#1b1830; --border:#2b2740;
    --brand-50:#241d47;
  }

  *{box-sizing:border-box;}
  html,body{margin:0;padding:0;height:100%;}
  body{
    background:var(--canvas); color:var(--ink-900); font-family:var(--sans);
    display:flex; height:100vh; overflow:hidden;
  }

  .sidebar{
    width:280px; flex-shrink:0; background:var(--surface); border-right:1px solid var(--border);
    overflow-y:auto; padding:22px 14px 30px;
  }
  .sidebar-header{ padding:4px 10px 20px; }
  .sidebar-title{
    font-family:var(--display); font-weight:800; font-size:16px; letter-spacing:-0.01em; margin:0;
  }
  .sidebar-sub{ margin:4px 0 0; font-size:12px; color:var(--ink-500); line-height:1.5; }

  .nav-group{ margin-bottom:18px; }
  .nav-group-label{
    margin:0 0 6px; padding:0 10px; font-size:10.5px; font-weight:700; letter-spacing:0.08em;
    text-transform:uppercase; color:var(--ink-400);
  }
  .nav-item{
    display:flex; flex-direction:column; align-items:flex-start; gap:2px; width:100%;
    text-align:left; padding:9px 10px; border-radius:10px; border:none; background:transparent;
    cursor:pointer; font-family:var(--sans);
  }
  .nav-item:hover{ background:var(--surface-2); }
  .nav-item.active{ background:var(--brand-50); }
  .nav-item.active .nav-item-label{ color:var(--brand-500); }
  .nav-item-label{ font-size:12.5px; font-weight:700; color:var(--ink-900); }
  .nav-item-to{ font-size:11px; color:var(--ink-400); }
  .nav-item:focus-visible{ outline:2px solid var(--brand-500); outline-offset:1px; }

  .main{ flex:1; min-width:0; display:flex; flex-direction:column; overflow:hidden; }
  .mail-header{
    padding:20px 32px; border-bottom:1px solid var(--border); background:var(--surface);
    flex-shrink:0;
  }
  .mail-header-eyebrow{
    margin:0 0 6px; font-size:10.5px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase;
    color:var(--ink-400);
  }
  .mail-header-subject{
    margin:0; font-family:var(--display); font-weight:700; font-size:18px; letter-spacing:-0.01em;
    text-wrap:balance;
  }
  .mail-header-meta{ margin:8px 0 0; font-size:12px; color:var(--ink-500); }
  .mail-header-meta b{ color:var(--ink-700); }

  .preview-scroll{ flex:1; overflow-y:auto; padding:32px; }
  .preview-frame-wrap{
    max-width:640px; margin:0 auto;
  }
  iframe{
    width:100%; border:none; display:block; background:var(--surface);
    border-radius:4px;
  }

  @media (max-width: 780px){
    body{ flex-direction:column; height:auto; overflow:visible; }
    .sidebar{ width:100%; border-right:none; border-bottom:1px solid var(--border); max-height:220px; }
    .main{ overflow:visible; }
    .preview-scroll{ overflow-y:visible; }
  }
</style>

<div class="sidebar">
  <div class="sidebar-header">
    <p class="sidebar-title">Email drafts</p>
    <p class="sidebar-sub">12 templates · click to preview</p>
  </div>
  ${navHtml}
</div>

<div class="main">
  <div class="mail-header">
    <p class="mail-header-eyebrow" id="mh-group">—</p>
    <h1 class="mail-header-subject" id="mh-subject">—</h1>
    <p class="mail-header-meta">To: <b id="mh-to">—</b></p>
  </div>
  <div class="preview-scroll">
    <div class="preview-frame-wrap">
      <iframe id="frame" title="Email preview" height="600"></iframe>
    </div>
  </div>
</div>

<script>
  const DATA = ${dataJson};
  const byId = Object.fromEntries(DATA.map(d => [d.id, d]));
  const frame = document.getElementById('frame');
  const mhSubject = document.getElementById('mh-subject');
  const mhTo = document.getElementById('mh-to');
  const mhGroup = document.getElementById('mh-group');
  const navItems = Array.from(document.querySelectorAll('.nav-item'));

  function resizeFrame() {
    try {
      const doc = frame.contentDocument;
      if (!doc) return;
      const h = doc.documentElement.scrollHeight;
      frame.style.height = (h + 4) + 'px';
    } catch (e) {}
  }

  function show(id) {
    const item = byId[id];
    if (!item) return;
    mhGroup.textContent = item.group;
    mhSubject.textContent = item.subject;
    mhTo.textContent = item.to;
    frame.srcdoc = item.html;
    frame.onload = resizeFrame;
    navItems.forEach(b => b.classList.toggle('active', b.dataset.id === id));
    try { sessionStorage.setItem('lb-email-preview', id); } catch (e) {}
  }

  navItems.forEach(btn => {
    btn.addEventListener('click', () => show(btn.dataset.id));
  });

  let initial = DATA[0].id;
  try {
    const stored = sessionStorage.getItem('lb-email-preview');
    if (stored && byId[stored]) initial = stored;
  } catch (e) {}
  show(initial);
</script>
`;

writeFileSync(outFile, html, "utf-8");
console.log(`Wrote gallery to ${outFile} (${(html.length / 1024).toFixed(0)} KB)`);
