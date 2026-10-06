/**
 * Transactional email, via Resend.
 *
 * SERVER ONLY — `RESEND_API_KEY` must never reach the browser.
 *
 * Email is the notification channel now that WhatsApp Business Cloud API is
 * dropped from the stack (PRD §6, CLAUDE.md). Supabase Auth still sends its
 * own sign-in links; everything here is the application's own mail.
 *
 * Copy rules that apply to every template below:
 *   - warm, never punitive. The coin-deposit wording is "showing up for each
 *     other" — never "forfeit" or "penalty" (CLAUDE.md).
 *   - a restriction notice names a reason category and never implies an
 *     automatic ban (PRD §5.1.1); a re-check notice gives no reason at all.
 *   - no message content, no Gist audio, no transcript, ever.
 */

export type EmailResult = { sent: boolean; reason?: string };

function from(): string {
  return process.env.EMAIL_FROM || "Toastly <hello@trytoastly.com>";
}

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/**
 * Send one email. Never throws — a failed notification must not take down
 * the action that triggered it.
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: "not configured" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ from: from(), to: [to], subject, html, text }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    return res.ok ? { sent: true } : { sent: false, reason: `http ${res.status}` };
  } catch {
    return { sent: false, reason: "network" };
  }
}

/** Shared shell. Deep green ground, sand type — the brand's own palette. */
function shell(heading: string, body: string): string {
  return `<div style="margin:0;padding:32px 0;background:#F6F2EA;font-family:Inter,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto">
    <tr><td style="padding:28px 26px;background:#001F1B;border-radius:12px 12px 0 0">
      <span style="font-family:Aleo,Georgia,serif;font-size:22px;font-weight:700;color:#EBD9AE">Toastly</span>
    </td></tr>
    <tr><td style="padding:28px 26px;background:#FFFFFF;border-radius:0 0 12px 12px">
      <h1 style="margin:0 0 14px;font-family:Aleo,Georgia,serif;font-size:22px;line-height:1.25;color:#050309">${heading}</h1>
      ${body}
    </td></tr>
    <tr><td style="padding:18px 26px;color:#504E52;font-size:12px;line-height:1.6">
      You're getting this because you have a Toastly account.
    </td></tr>
  </table>
</div>`;
}

/**
 * Emergency contact changed.
 *
 * NOT a verification code — see the note at the top of this file. This is a
 * security notice: an attacker holding a live session could otherwise point
 * panic alerts at their own phone silently. The member is told out-of-band,
 * on a channel that session does not control.
 *
 * The contact's number is deliberately not repeated in full.
 */
export function sendEmergencyContactChanged(
  to: string,
  { label, lastFour }: { label: string; lastFour: string },
) {
  const line = `Your emergency contact is now "${label}", on a number ending ${lastFour}. Panic alerts and date check-ins go to them.`;
  return sendEmail({
    to,
    subject: "Your Toastly emergency contact changed",
    text: `${line} If this wasn't you, change it back at trytoastly.com/safety-kit and change your password.`,
    html: shell(
      "Your emergency contact changed",
      `<p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#1E1C21">${line}</p>
       <p style="margin:0;font-size:14px;line-height:1.6;color:#504E52">If this wasn't you, change it back in your safety kit and change your password — someone else may be signed in.</p>`,
    ),
  });
}

/**
 * A receipt.
 *
 * Coins are framed as a promise kept, not a fee paid: the wording here has to
 * match the coins page's.
 */
export function sendReceipt(
  to: string,
  { amount, reference, item }: { amount: string; reference: string; item: string },
) {
  return sendEmail({
    to,
    subject: "Your Toastly receipt",
    text: `Thanks — that went through. ${item}: ${amount}. Reference ${reference}. Coins you stake on a date come straight back when you both turn up.`,
    html: shell(
      "That went through",
      `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#1E1C21">${item}</p>
       <p style="margin:0 0 14px;font-size:22px;font-weight:600;color:#050309">${amount}</p>
       <p style="margin:0 0 18px;font-size:13px;color:#504E52">Reference ${reference}</p>
       <p style="margin:0;font-size:14px;line-height:1.6;color:#504E52">Coins you stake on a date come straight back when you both turn up.</p>`,
    ),
  });
}

/**
 * A plan that won't renew on its own is ending (a 30-day pass, or a card
 * plan whose renewal was stopped). Sent once, a few days before. A nudge,
 * never pressure: no countdown, no "last chance".
 */
export function sendPlanEnding(to: string, { plan, ends }: { plan: string; ends: string }) {
  const url = `${process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://www.trytoastly.com"}/profile/plan`;
  return sendEmail({
    to,
    subject: `Your ${plan} ends on ${ends}`,
    text: `Your ${plan} ends on ${ends}. If you'd like to keep it, you can add another 30 days or switch to a card plan here: ${url}. If not, nothing to do — you'll move to Starter, which is free, and keep your matches and verification.`,
    html: shell(
      `Your ${plan} ends on ${ends}`,
      `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#1E1C21">If you&rsquo;d like to keep it, you can add another 30 days or switch to a card plan.</p>
       <p style="margin:0 0 18px"><a href="${url}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#FFB300;color:#050309;font-size:15px;font-weight:600;text-decoration:none">See your plan</a></p>
       <p style="margin:0;font-size:14px;line-height:1.6;color:#504E52">If not, there&rsquo;s nothing to do. You&rsquo;ll move to Starter, which is free, and keep your matches and verification.</p>`,
    ),
  });
}

/**
 * The re-check notice (PRD §5.1.1).
 *
 * The member is always told, and never told why (decided 6 October 2026):
 * a re-check carries NO reason — the reason category is given only when an
 * account is restricted. The words are screen 4's (lib/consent.ts). Do not
 * add a reason, a deadline, a threat, or language implying the account is
 * already judged.
 */
export function sendReverificationNotice(to: string) {
  const line = "We sometimes ask members to confirm it's still them. One selfie, about a minute.";
  return sendEmail({
    to,
    subject: "A quick re-check on your Toastly account",
    text: `${line} trytoastly.com/verify`,
    html: shell(
      "Quick re-check",
      `<p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#1E1C21">${line}</p>
       <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#504E52">Your conversations stay where they are.</p>
       <p style="margin:0"><a href="https://trytoastly.com/verify" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#FFB300;color:#050309;font-size:15px;font-weight:600;text-decoration:none">Start the re-check</a></p>`,
    ),
  });
}

/*
 * Review-queue outcomes (0025). Same rules as the re-verification notice:
 * the member is always told, with a reason CATEGORY only — never the signal,
 * the reporter or the evidence — and a way to reach a person.
 */

const BUTTON =
  "display:inline-block;padding:12px 20px;border-radius:8px;background:#FFB300;color:#050309;font-size:15px;font-weight:600;text-decoration:none";
const P = "margin:0 0 14px;font-size:15px;line-height:1.6;color:#1E1C21";
const SMALL = "margin:0;font-size:14px;line-height:1.6;color:#504E52";

/** The member is paying the Naira price but their profile says they live abroad. */
export function sendSwitchPlanNotice(to: string) {
  const line =
    "Your profile says you live outside Nigeria, and your plan is a Naira plan. Naira plans are for members at home; the Diaspora plan is the one for members abroad, and it includes matching with others in your city as it opens.";
  return sendEmail({
    to,
    subject: "About your Toastly plan",
    text: `${line} Nothing has changed on your account. If you live in Nigeria, update your profile country and that's it. Otherwise, please move to the Diaspora plan when your current one ends: trytoastly.com/profile/plan`,
    html: shell(
      "About your plan",
      `<p style="${P}">${line}</p>
       <p style="${P}">Nothing has changed on your account. If you live in Nigeria, update your profile country and that&rsquo;s it. Otherwise, please move to the Diaspora plan when your current one ends.</p>
       <p style="margin:0"><a href="https://www.trytoastly.com/profile/plan" style="${BUTTON}">See your plan</a></p>`,
    ),
  });
}

export function sendRestrictionNotice(to: string, { reasonCategory }: { reasonCategory: string }) {
  const line = `Your Toastly account is restricted while a person on our team looks into something — the reason category is "${reasonCategory}". For now you won't appear in anyone's matches and can't start new conversations, Gists or dates.`;
  return sendEmail({
    to,
    subject: "Your Toastly account is restricted for now",
    text: `${line} You can still use the safety kit, report or block anyone, verify, and download or delete your data. To talk to a person, open Toastly Help in the app.`,
    html: shell(
      "Your account is restricted for now",
      `<p style="${P}">${line}</p>
       <p style="${SMALL}">You can still use the safety kit, report or block anyone, verify, and download or delete your data. To talk to a person, open Toastly Help in the app.</p>`,
    ),
  });
}

export function sendRestrictionLifted(to: string) {
  return sendEmail({
    to,
    subject: "Your Toastly account is back to normal",
    text: "The restriction on your Toastly account has been lifted. You'll appear in matches again from tomorrow's six, and you can start conversations as before.",
    html: shell(
      "You're back to normal",
      `<p style="${P}">The restriction on your account has been lifted. You&rsquo;ll appear in matches again from tomorrow&rsquo;s six, and you can start conversations as before.</p>`,
    ),
  });
}

export function sendRemovalNotice(to: string, { reasonCategory }: { reasonCategory: string }) {
  const line = `We've closed your Toastly account after a review by a person on our team — the reason category is "${reasonCategory}".`;
  return sendEmail({
    to,
    subject: "Your Toastly account has been closed",
    text: `${line} You won't be able to sign in or create a new verified account. We keep only what the law and member safety require, for the periods in our privacy policy (trytoastly.com/privacy). If you think this is a mistake, reply to this email.`,
    html: shell(
      "Your account has been closed",
      `<p style="${P}">${line}</p>
       <p style="${SMALL}">You won&rsquo;t be able to sign in or create a new verified account. We keep only what the law and member safety require, for the periods in our <a href="https://www.trytoastly.com/privacy">privacy policy</a>. If you think this is a mistake, reply to this email.</p>`,
    ),
  });
}

/**
 * Tell the team a Toastly Help hand-off is waiting. Reference and category
 * only: the member's words stay in support_tickets (cleared after the
 * retention period), not in an inbox that keeps them forever.
 */
export function sendSupportTicketNotice(reference: string, category: string): Promise<EmailResult> {
  const to = process.env.SUPPORT_INBOX || "support@trytoastly.com";
  const subject = `Toastly Help hand-off ${reference} (${category})`;
  const text = `A member passed a ${category} request to the team through Toastly Help.\n\nReference: ${reference}\n\nRead it in Supabase: support_tickets, where reference = '${reference}'. Reply to the member by email within the retention period.`;
  const html = `<p>A member passed a <strong>${category}</strong> request to the team through Toastly Help.</p><p>Reference: <strong>${reference}</strong></p><p>Read it in Supabase: <code>support_tickets</code>, where reference = '${reference}'. Reply to the member by email within the retention period.</p>`;
  return sendEmail({ to, subject, html, text });
}
