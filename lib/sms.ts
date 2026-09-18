/**
 * SMS — one abstraction, two providers.
 *
 * SERVER ONLY. Provider credentials must never reach the browser.
 *
 * ---------------------------------------------------------------------------
 * WHAT SMS IS FOR HERE, EXHAUSTIVELY:
 *
 *   1. Confirming an emergency contact's number at setup (one code, once).
 *   2. Panic alerts and share-your-date messages to that confirmed contact.
 *
 * WHAT IT IS NEVER FOR:
 *
 *   - Any part of the call path. CLAUDE.md is unambiguous: calling is VoIP
 *     through the app, and neither member's real number is ever routed,
 *     dialled, bridged or exposed as part of the calling mechanism. Nothing
 *     in this module may be imported by Gist or LiveKit code, and a
 *     constraint check enforces that.
 *   - Member-to-member messaging of any kind. Two members never exchange
 *     numbers through Toastly.
 *   - Marketing, nudges, re-engagement, or anything a member did not ask for.
 *
 * A trusted contact's number belongs to someone who never signed up for
 * Toastly. It is used to send the message that member asked for, and for
 * nothing else.
 * ---------------------------------------------------------------------------
 *
 * Routing: Nigerian numbers go to Termii, which has the domestic delivery and
 * the local sender-ID registration. Everything else goes to Twilio.
 */

export type SmsProvider = "termii" | "twilio";

export type SmsResult = {
  sent: boolean;
  provider: SmsProvider | null;
  /** A short reason, safe to log. Never contains the number or the body. */
  reason?: string;
};

/**
 * Normalise to E.164.
 *
 * Nigerian local form (0803…) becomes +234803…. Anything already in
 * international form is left alone. Returns null when it cannot be made
 * sense of, so a malformed number fails loudly at setup rather than silently
 * at the moment somebody needs help.
 */
export function toE164(raw: string, defaultCountry: "NG" = "NG"): string | null {
  const trimmed = raw.replace(/[\s()-]/g, "");
  if (/^\+[1-9]\d{7,14}$/.test(trimmed)) return trimmed;

  const digits = trimmed.replace(/\D/g, "");
  if (defaultCountry === "NG") {
    // 0803… -> +234803…
    if (/^0\d{10}$/.test(digits)) return `+234${digits.slice(1)}`;
    // 234803… -> +234803…
    if (/^234\d{10}$/.test(digits)) return `+${digits}`;
  }
  return null;
}

export function providerFor(e164: string): SmsProvider {
  return e164.startsWith("+234") ? "termii" : "twilio";
}

export function smsConfigured(e164?: string): boolean {
  const termii = Boolean(process.env.TERMII_API_KEY && process.env.TERMII_SENDER_ID);
  const twilio = Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM_NUMBER,
  );
  if (!e164) return termii || twilio;
  return providerFor(e164) === "termii" ? termii : twilio;
}

async function sendViaTermii(to: string, body: string): Promise<SmsResult> {
  const apiKey = process.env.TERMII_API_KEY;
  const from = process.env.TERMII_SENDER_ID;
  if (!apiKey || !from) {
    return { sent: false, provider: "termii", reason: "not configured" };
  }

  try {
    const res = await fetch("https://api.ng.termii.com/api/sms/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to,
        from,
        sms: body,
        type: "plain",
        channel: "generic",
        api_key: apiKey,
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    return res.ok
      ? { sent: true, provider: "termii" }
      : { sent: false, provider: "termii", reason: `http ${res.status}` };
  } catch {
    return { sent: false, provider: "termii", reason: "network" };
  }
}

async function sendViaTwilio(to: string, body: string): Promise<SmsResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) {
    return { sent: false, provider: "twilio", reason: "not configured" };
  }

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        },
        body: new URLSearchParams({ To: to, From: from, Body: body }),
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      },
    );
    return res.ok
      ? { sent: true, provider: "twilio" }
      : { sent: false, provider: "twilio", reason: `http ${res.status}` };
  } catch {
    return { sent: false, provider: "twilio", reason: "network" };
  }
}

/**
 * Send one SMS.
 *
 * Never throws: a failure returns `sent: false` with a reason that carries
 * neither the number nor the body. A panic alert that fails must degrade to
 * the on-device share sheet, not to an error page.
 */
export async function sendSms(to: string, body: string): Promise<SmsResult> {
  const e164 = toE164(to);
  if (!e164) return { sent: false, provider: null, reason: "unparseable number" };
  return providerFor(e164) === "termii"
    ? sendViaTermii(e164, body)
    : sendViaTwilio(e164, body);
}
