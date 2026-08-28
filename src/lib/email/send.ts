import "server-only";

/**
 * Thin wrapper over Brevo's transactional email API. Deliberately fire-and-forget-safe: a failed
 * or misconfigured send never throws, so a Brevo outage can never block an approval, a new hire's
 * account, or anything else the app actually needs to do — it only means that one notification
 * didn't go out, which is logged, not fatal.
 */

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
const SENDER = { name: "LeaveBase", email: "leavebase@prismixstudios.in" };

export type SendEmailResult = { ok: true } | { ok: false; error: string };

export async function sendEmail(opts: {
  to: { email: string; name?: string }[];
  subject: string;
  html: string;
}): Promise<SendEmailResult> {
  if (opts.to.length === 0) return { ok: true };

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.error(`[email] BREVO_API_KEY is not set — dropped "${opts.subject}" to ${opts.to.map((t) => t.email).join(", ")}`);
    return { ok: false, error: "Email sending is not configured." };
  }

  try {
    const res = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        sender: SENDER,
        to: opts.to,
        subject: opts.subject,
        htmlContent: opts.html,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[email] Brevo rejected "${opts.subject}" (${res.status}): ${body}`);
      return { ok: false, error: `Brevo returned ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    console.error(`[email] send threw for "${opts.subject}":`, e);
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}
