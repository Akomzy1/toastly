/**
 * Toastly Help → a person (lib/help-escalation.ts, lib/crisis-lines.ts):
 * every hand-off trigger, the keyword check that can raise on its own, the
 * higher-of-two rule, the 4-turn offer, the reply-time line, and alerts that
 * carry nothing but the ticket number, urgency and a link.
 *
 * The database side (filing, the Support tab, re-alerts, retention) is in
 * scripts/sql-test/help-escalation.test.mjs.
 *
 *   node --test scripts/help-escalation.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RULE_CATEGORIES,
  SAFETY_CATEGORIES,
  alertEmail,
  alertSms,
  decideHandoff,
  digestEmail,
  keywordCheck,
  slaLine,
  slaText,
} from "../lib/help-escalation.ts";
import { crisisLinesFor, allCrisisLines, isReviewed } from "../lib/crisis-lines.ts";

const BASE = { memberTurns: 1, offerAfterTurns: 4, ticketOpen: false };
const decide = (o) => decideHandoff({ ...BASE, model: null, keyword: null, ...o });

// ---------------------------------------------------------------------------
// 1. The member asks for a person — always honoured
// ---------------------------------------------------------------------------

test("asking for a person is honoured, however it's put", () => {
  for (const text of [
    "Can I talk to a real person?",
    "I want to speak to a human",
    "human please",
    "I need an agent",
    "let me chat with your customer care",
    "you're not a bot are you, I want customer service",
    "abeg I wan talk to person",
    "is there a real human here",
  ]) {
    const k = keywordCheck(text);
    assert.equal(k?.handoff, "normal", text);
    assert.equal(k?.trigger, "member_asked", text);
    // Even when the model thinks it can answer, the member's ask wins.
    const d = decide({ model: { handoff: "none", category: "payment" }, keyword: k });
    assert.equal(d.handoff, "normal", text);
    assert.equal(d.trigger, "member_asked");
    assert.equal(d.category, "payment", "the model's topic is kept for staff");
  }
  // And when the model isn't reached at all.
  assert.equal(decide({ keyword: keywordCheck("talk to a person") }).handoff, "normal");
});

// ---------------------------------------------------------------------------
// 2. Rule topics — a person decides, every time
// ---------------------------------------------------------------------------

test("every rule topic files a ticket, even if the model says none", () => {
  for (const category of RULE_CATEGORIES) {
    const d = decide({ model: { handoff: "none", category } });
    assert.equal(d.handoff, "normal", category);
    assert.equal(d.category, category);
    assert.equal(d.trigger, "rule_topic");
    assert.equal(d.offerPerson, false);
  }
  assert.deepEqual([...RULE_CATEGORIES].sort(), [
    "appeal",
    "charged_no_plan",
    "data_request",
    "dispute",
    "refund",
    "restriction",
    "verification_repeat",
  ]);
});

test("repeated verification failure is counted on the server", () => {
  const model = { handoff: "none", category: "verification" };
  assert.equal(decide({ model, failedVerifications: 2 }).handoff, "none");
  const d = decide({ model, failedVerifications: 3 });
  assert.equal(d.handoff, "normal");
  assert.equal(d.category, "verification_repeat");
  assert.equal(d.trigger, "rule_topic");
});

// ---------------------------------------------------------------------------
// 3. Safety topics — urgent, the assistant never handles them
// ---------------------------------------------------------------------------

const SAFETY_SAMPLES = {
  threat: ["He threatened to leak my pictures", "she is blackmailing me", "dem wan kill me", "he said he will hurt me"],
  harassed: ["He keeps messaging me after I said no", "this guy is harassing me", "he sent me nudes I didn't ask for"],
  unsafe: ["I don't feel safe", "I feel unsafe with this person", "I'm in danger", "I no dey safe"],
  money_request: ["My match asked me for money", "she keeps asking for cash", "he wants me to send him money"],
  scam: ["I think this is a scam", "he's a yahoo boy", "she wants me to join an investment scheme", "fake profile"],
  under_18: ["I think she's underage", "he told me he's 16", "she is still in secondary school"],
  self_harm: ["I want to kill myself", "I don't want to live anymore", "thinking about suicide", "i wan kill myself"],
};

test("every safety topic is urgent from the keyword check alone, model or not", () => {
  assert.deepEqual(Object.keys(SAFETY_SAMPLES).sort(), [...SAFETY_CATEGORIES].sort());
  for (const [category, samples] of Object.entries(SAFETY_SAMPLES)) {
    for (const text of samples) {
      const k = keywordCheck(text);
      assert.equal(k?.handoff, "urgent", text);
      assert.equal(k?.category, category, text);
      // The model said everything was fine: the keyword check still raises it.
      const d = decide({ model: { handoff: "none", category: "how_it_works" }, keyword: k });
      assert.equal(d.handoff, "urgent", text);
      assert.equal(d.category, category, text);
      assert.equal(d.trigger, "safety");
    }
  }
});

test("the model alone can make it urgent, and urgent is always a safety topic", () => {
  for (const category of SAFETY_CATEGORIES) {
    const d = decide({ model: { handoff: "none", category } });
    assert.equal(d.handoff, "urgent", category);
  }
  const d = decide({ model: { handoff: "urgent", category: "payment" } });
  assert.equal(d.handoff, "urgent");
  assert.equal(d.category, "unsafe");
});

test("the higher of model and keyword wins, both ways", () => {
  // Keyword urgent beats model normal.
  let d = decide({ model: { handoff: "normal", category: "refund" }, keyword: keywordCheck("he threatened me") });
  assert.equal(d.handoff, "urgent");
  assert.equal(d.category, "threat");
  // Model urgent beats keyword normal.
  d = decide({ model: { handoff: "urgent", category: "harassed" }, keyword: keywordCheck("talk to a person") });
  assert.equal(d.handoff, "urgent");
  assert.equal(d.category, "harassed");
  // Never lowered.
  d = decide({ model: { handoff: "none", category: "other" }, keyword: keywordCheck("I want to end my life") });
  assert.equal(d.handoff, "urgent");
});

test("self-harm from either side decides what the member sees first", () => {
  let d = decide({ model: { handoff: "urgent", category: "threat" }, keyword: keywordCheck("I want to kill myself") });
  assert.equal(d.category, "self_harm");
  d = decide({ model: { handoff: "urgent", category: "self_harm" }, keyword: keywordCheck("he threatened me") });
  assert.equal(d.category, "self_harm");
  // A message about both is self-harm: checked first.
  assert.equal(keywordCheck("he threatened me and now I want to kill myself").category, "self_harm");
});

test("everyday questions don't page anyone", () => {
  for (const text of [
    "How do I set my emergency contact?",
    "a minor problem with my payment",
    "The app won't stop loading",
    "Is my data safe with you?",
    "I'm 15 minutes late to my date, what happens to my coins?",
    "Can I pay for Premium with coins?",
    "Why didn't my selfie check work?",
    "How do refunds work?",
    "Can I ask for data deletion?",
    "I want to ask for my data",
  ]) {
    assert.equal(keywordCheck(text), null, text);
  }
});

// ---------------------------------------------------------------------------
// 4. Not resolved after N member turns: offer a person
// ---------------------------------------------------------------------------

test("a person is offered from the 4th member turn, once nothing else has", () => {
  const model = { handoff: "none", category: "verification" };
  assert.equal(decide({ model, memberTurns: 3 }).offerPerson, false);
  assert.equal(decide({ model, memberTurns: 4 }).offerPerson, true);
  assert.equal(decide({ model, memberTurns: 7 }).offerPerson, true);
  // From config.
  assert.equal(decide({ model, memberTurns: 4, offerAfterTurns: 6 }).offerPerson, false);
  // Not when a ticket is already open, or when it's already handed over.
  assert.equal(decide({ model, memberTurns: 5, ticketOpen: true }).offerPerson, false);
  assert.equal(decide({ model: { handoff: "normal", category: "refund" }, memberTurns: 5 }).offerPerson, false);
});

test("no model and no keyword: nothing is filed", () => {
  const d = decide({});
  assert.equal(d.handoff, "none");
  assert.equal(d.trigger, null);
});

// ---------------------------------------------------------------------------
// The member's reply-time line
// ---------------------------------------------------------------------------

test("the reply time reads naturally, from the configured minutes", () => {
  assert.equal(slaText(60), "1 hour");
  assert.equal(slaText(1440), "24 hours");
  assert.equal(slaText(120), "2 hours");
  assert.equal(slaText(30), "30 minutes");
  assert.equal(slaText(90), "90 minutes");
  assert.equal(slaLine(60), "A person from our team will reply within 1 hour.");
  assert.equal(slaLine(1440), "A person from our team will reply within 24 hours.");
});

// ---------------------------------------------------------------------------
// Alerts: the ticket number, urgency and a console link — nothing else
// ---------------------------------------------------------------------------

const LEAKY = {
  reference: "TH-12345",
  urgency: "urgent",
  // None of these may reach an SMS or an inbox.
  name: "Amaka Obi",
  email: "amaka@example.com",
  phone: "+2348030000000",
  category: "self_harm",
  summary: "I don't want to live anymore",
  transcript: [{ role: "member", content: "secret words" }],
};
const FORBIDDEN = ["Amaka", "amaka@", "+234803", "self_harm", "Self-harm", "live anymore", "secret words"];

test("alerts carry only the ticket number, urgency and a console link", () => {
  const base = "https://www.trytoastly.com";
  const sms = alertSms(LEAKY, base);
  const again = alertSms(LEAKY, base, true);
  const mail = alertEmail(LEAKY, base);
  const remail = alertEmail({ ...LEAKY, urgency: "normal" }, base);
  for (const out of [sms, again, mail.subject, mail.text, mail.html, remail.subject, remail.text]) {
    for (const bad of FORBIDDEN) assert.ok(!out.includes(bad), `"${bad}" leaked into: ${out}`);
    assert.ok(out.includes("TH-12345"));
  }
  assert.match(sms, /URGENT/);
  assert.match(sms, /https:\/\/www\.trytoastly\.com\/staff\/support\/TH-12345/);
  assert.match(again, /still not opened/);
  assert.match(remail.subject, /Normal/);
  assert.ok(sms.length <= 160, "fits one SMS");
});

test("the morning digest lists open tickets oldest first, numbers only", () => {
  const rows = [
    { ...LEAKY, reference: "TH-22222", urgency: "normal", created_at: "2026-10-08T09:00:00Z" },
    { ...LEAKY, reference: "TH-11111", urgency: "urgent", created_at: "2026-10-07T09:00:00Z" },
    { ...LEAKY, reference: "TH-33333", urgency: "normal", created_at: "2026-10-09T05:00:00Z" },
  ];
  const d = digestEmail(rows, "https://www.trytoastly.com", Date.parse("2026-10-09T07:00:00Z"));
  for (const bad of FORBIDDEN) assert.ok(!d.text.includes(bad) && !d.html.includes(bad), bad);
  const order = ["TH-11111", "TH-22222", "TH-33333"].map((r) => d.text.indexOf(r));
  assert.ok(order[0] < order[1] && order[1] < order[2], "oldest first");
  assert.match(d.subject, /3 open tickets/);
  assert.match(d.text, /TH-11111 · URGENT · waiting 46h/);
  assert.equal(digestEmail([], "https://x", Date.now()).text, "No open tickets this morning.");
});

// ---------------------------------------------------------------------------
// Crisis lines: static, and only once a person has reviewed them
// ---------------------------------------------------------------------------

test("crisis lines reach a member only once a person has reviewed them", () => {
  const line = (over) => ({ name: "Line", contact: "123", href: "tel:123", how: "Call", source: "x.org", reviewedBy: null, reviewedOn: null, ...over });
  const table = {
    GB: [line({ name: "Unreviewed" }), line({ name: "Reviewed", reviewedBy: "Tokunbo", reviewedOn: "2026-10-09" }), line({ name: "No date", reviewedBy: "Tokunbo" })],
  };
  assert.deepEqual(crisisLinesFor("GB", table).map((l) => l.name), ["Reviewed"]);
  assert.deepEqual(crisisLinesFor("gb", table).map((l) => l.name), ["Reviewed"]);
  assert.deepEqual(crisisLinesFor("FR", table), [], "no entry: local emergency number instead");
  // The shipped list: whatever is shown has been reviewed, and every entry is dialable.
  for (const [country, lines] of Object.entries(allCrisisLines())) {
    for (const l of crisisLinesFor(country)) assert.ok(isReviewed(l));
    for (const l of lines) {
      assert.match(l.href, /^(tel|sms):\+?\d+$/, `${country} ${l.name}`);
      assert.ok(l.source, `${country} ${l.name} has a source to check against`);
    }
  }
});
