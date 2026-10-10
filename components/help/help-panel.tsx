"use client";

import * as React from "react";
import Link from "next/link";
import type { HelpAnswer, TeamReply } from "@/lib/help-answer";
import type { CrisisLine } from "@/lib/crisis-lines";
import type { EmergencyNumber } from "@/lib/safety";

/**
 * Toastly Help — toastly-help.slim.html and toastly-help-handoff.slim.html.
 *
 * The AI label sits under the title every time it opens. No avatar, name or
 * persona: replies are labelled "Toastly Help · AI". A reply can carry one
 * teal action. It answers in the language you write in.
 *
 * Hand-offs (owner, 9 October 2026) are decided by the server: when the
 * member asks for a person, or the topic is one a person decides, the ticket
 * is filed at once and the member sees the reference and the reply time.
 * Safety topics show the safety tools straight away (self-harm: crisis lines
 * first). After a few turns with no answer, a person is offered.
 *
 * NOT IN THE PROTOTYPES — flagged: the safety card, the crisis lines, the
 * reply-time line, "From our team" replies, the "Toastly Help" button that
 * opens the panel, and the hand-off filing without a button (the prototype
 * shows a "Pass this to our team" tap; the new rule files it for the member).
 * All are built from the panel's own cards and buttons.
 */

type Lang = "en" | "pcm";

type Item =
  | { kind: "member"; text: string }
  | { kind: "reply"; reply: HelpAnswer }
  | { kind: "offer"; lang: Lang; reason: "asked" | "not_resolved"; category: string }
  | { kind: "passed"; reference: string; sla: string; lang: Lang; paragraphs?: string[] }
  | {
      kind: "safety";
      selfHarm: boolean;
      crisis: CrisisLine[];
      emergency: EmergencyNumber[];
      reference: string | null;
      sla: string | null;
    }
  | { kind: "error"; text: string };

const ACTIONS: Record<Exclude<HelpAnswer["action"], "none">, { href: string; en: string; pcm: string }> = {
  retry_selfie: { href: "/verify", en: "Try the selfie again", pcm: "Try di selfie again" },
  check_id: { href: "/verify", en: "Check my ID", pcm: "Check my ID" },
  payment: { href: "/profile/plan", en: "Try the payment again", pcm: "Try di payment again" },
  coins: { href: "/coins", en: "See your coins", pcm: "Check your coins" },
};

const STARTERS = [
  "Why didn't my selfie check work?",
  "How do I check my ID?",
  "My payment didn't go through",
  "How do coin deposits work?",
];

const LABEL = "m-0 mx-0.5 text-chip font-semibold text-grey-600";
const CARD = "grid gap-2.5 rounded-[6px_16px_16px_16px] border border-ink-900/[.12] bg-white p-3.5";
const PARA = "m-0 text-ui leading-[1.6] text-ink-800";
const TEAL =
  "mt-1 flex min-h-12 w-full items-center justify-center rounded-lg bg-green-500 px-4 py-3 text-center text-button text-white no-underline transition-colors duration-200 hover:bg-green-600 disabled:bg-grey-200 disabled:text-grey-600";
const OUTLINE =
  "flex min-h-12 w-full items-center justify-center rounded-lg border border-ink-900/20 bg-transparent px-4 py-3 text-center text-button text-ink-900 no-underline hover:border-green-500 hover:bg-green-50";
const PERSON =
  "inline-flex min-h-11 items-center justify-self-start px-0.5 text-nav font-medium text-green-500 underline underline-offset-4";

export function HelpPanel({
  open,
  onClose,
  initialItems = [],
  initialReplies,
}: {
  open: boolean;
  onClose: () => void;
  /** For the /audit harness only. */
  initialItems?: Item[];
  /** For the /audit harness only; otherwise fetched when the panel opens. */
  initialReplies?: TeamReply[];
}) {
  const [items, setItems] = React.useState<Item[]>(initialItems);
  const [replies, setReplies] = React.useState<TeamReply[]>(initialReplies ?? []);
  const [draft, setDraft] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Replies from the team: fetched each time the panel opens, then marked read.
  React.useEffect(() => {
    if (!open || initialReplies) return;
    let live = true;
    void (async () => {
      try {
        const res = await fetch("/api/help/replies", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { replies?: TeamReply[] };
        if (!live || !json.replies?.length) return;
        setReplies(json.replies);
        const unread = Array.from(new Set(json.replies.filter((r) => !r.read).map((r) => r.ticket_id)));
        for (const ticket_id of unread) {
          void fetch("/api/help/replies", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ticket_id }),
          });
        }
      } catch {}
    })();
    return () => {
      live = false;
    };
  }, [open, initialReplies]);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [items]);

  if (!open) return null;

  const lastLang: Lang =
    ([...items].reverse().find((i) => i.kind === "reply") as { reply: HelpAnswer } | undefined)?.reply.language ?? "en";
  const handedOff = items.some((i) => i.kind === "passed" || (i.kind === "safety" && i.reference));

  function itemsFor(a: HelpAnswer): Item[] {
    if (a.safety) {
      return [
        {
          kind: "safety",
          selfHarm: a.category === "self_harm",
          crisis: a.crisis ?? [],
          emergency: a.emergency,
          reference: a.ticket?.reference ?? null,
          sla: a.ticket?.sla ?? null,
        },
      ];
    }
    if (a.ticket) return [{ kind: "passed", reference: a.ticket.reference, sla: a.ticket.sla, lang: a.language, paragraphs: a.paragraphs }];
    const out: Item[] = [{ kind: "reply", reply: a }];
    if (a.offer_person) out.push({ kind: "offer", lang: a.language, reason: "not_resolved", category: a.category });
    return out;
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setDraft("");
    setBusy(true);
    setItems((prev) => [...prev.filter((i) => i.kind !== "offer"), { kind: "member", text: message }]);
    try {
      const res = await fetch("/api/help", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId, message }),
      });
      const json = (await res.json()) as { conversation_id?: string; reply?: HelpAnswer; error?: string };
      if (json.conversation_id) setConversationId(json.conversation_id);
      if (!res.ok || !json.reply) {
        setItems((prev) => [...prev, { kind: "error", text: json.error ?? "Something went wrong. Please try again." }]);
      } else {
        setItems((prev) => [...prev, ...itemsFor(json.reply!)]);
      }
    } catch {
      setItems((prev) => [...prev, { kind: "error", text: "You seem to be offline. Please try again." }]);
    }
    setBusy(false);
  }

  function offerPerson(category: string, lang: Lang) {
    setItems((prev) => (prev.some((i) => i.kind === "offer") || handedOff ? prev : [...prev, { kind: "offer", lang, reason: "asked", category }]));
  }

  async function passOn(category: string, reason: "asked" | "not_resolved", lang: Lang) {
    setBusy(true);
    try {
      const res = await fetch("/api/help/handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId, category, reason: reason === "not_resolved" ? "not_resolved" : "asked" }),
      });
      const json = (await res.json()) as { reference?: string; sla?: string; error?: string };
      setItems((prev) => [
        ...prev.filter((i) => i.kind !== "offer"),
        json.reference
          ? { kind: "passed", reference: json.reference, sla: json.sla ?? "", lang }
          : { kind: "error", text: json.error ?? "We couldn't pass this on. Email support@trytoastly.com." },
      ]);
    } catch {
      setItems((prev) => [...prev, { kind: "error", text: "You seem to be offline. Please try again." }]);
    }
    setBusy(false);
  }

  function copy(reference: string) {
    try {
      void navigator.clipboard?.writeText(reference);
    } catch {}
    setCopied(reference);
    window.setTimeout(() => setCopied(null), 2000);
  }

  const referenceBox = (reference: string) => (
    <div className="flex items-center justify-between gap-2.5 rounded-lg bg-green-50 py-3 pl-3.5 pr-3">
      <span className="grid min-w-0 gap-0.5">
        <span className="font-sans text-chip font-semibold uppercase tracking-[0.12em] text-green-500">Reference</span>
        <span className="text-[17px] font-semibold tabular-nums tracking-[0.04em] text-ink-900">{reference}</span>
      </span>
      <button
        type="button"
        onClick={() => copy(reference)}
        className="min-h-11 flex-shrink-0 rounded-md border border-ink-900/20 bg-white px-3.5 py-2.5 text-nav font-semibold text-ink-900 hover:border-green-500"
      >
        {copied === reference ? "Copied" : "Copy"}
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-ink-900/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-[480px] flex-col overflow-hidden bg-paper"
      >
        <div className="flex items-center justify-between gap-2.5 bg-green-800 py-3 pl-4 pr-2">
          <p id="help-title" className="m-0 font-serif text-[19px] font-bold text-white">
            Toastly Help
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Toastly Help"
            className="h-11 w-11 rounded-md text-[24px] leading-none text-champagne hover:bg-champagne/[.12]"
          >
            ×
          </button>
        </div>
        <div className="border-b border-green-500/[.18] bg-green-50 px-4 py-3">
          <p className="m-0 text-[13.5px] leading-[1.55] text-ink-800">
            <strong className="font-semibold text-ink-900">Toastly Help is an AI assistant.</strong> A person handles
            refunds, disputes and appeals.
          </p>
        </div>

        <div className="grid flex-1 content-start gap-4 overflow-y-auto px-3.5 pb-6 pt-5">
          {replies.length ? (
            <section aria-label="From our team" className="grid gap-2.5">
              {replies.map((r) => (
                <div key={r.id} className="grid gap-1.5">
                  <p className={LABEL}>
                    Toastly team · a person{r.reference ? ` · ${r.reference}` : ""}
                  </p>
                  <div className="grid gap-2.5 rounded-[6px_16px_16px_16px] border border-green-500/[.35] bg-white p-3.5">
                    {r.body.split(/\n{2,}/).map((p, j) => (
                      <p key={j} className={`${PARA} whitespace-pre-line`}>
                        {p}
                      </p>
                    ))}
                    <p className="m-0 text-[12.5px] text-grey-600">
                      {new Date(r.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      {r.read ? "" : " · New"}
                    </p>
                  </div>
                </div>
              ))}
            </section>
          ) : null}

          {items.length === 0 ? (
            <div className="grid gap-4">
              <div className="grid gap-1.5 px-0.5">
                <h2 className="m-0 font-serif text-[21px] font-bold leading-[1.25] text-ink-900">What can I help with?</h2>
                <p className="m-0 text-[14.5px] leading-[1.6] text-grey-600">Ask in English or Pidgin, or start with one of these.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {STARTERS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => send(q)}
                    className="min-h-11 rounded-pill border border-green-500/[.35] bg-white px-4 py-2.5 text-left text-nav font-medium leading-[1.35] text-green-500 transition-colors duration-200 hover:border-green-500 hover:bg-green-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {items.map((item, i) => {
            if (item.kind === "member") {
              return (
                <p key={i} className="m-0 max-w-[85%] justify-self-end rounded-[16px_16px_6px_16px] bg-green-800 px-3.5 py-3 text-ui leading-normal text-white">
                  {item.text}
                </p>
              );
            }
            if (item.kind === "reply") {
              const r = item.reply;
              const action = r.action !== "none" ? ACTIONS[r.action] : null;
              return (
                <div key={i} className="grid gap-1.5">
                  <p className={LABEL}>Toastly Help · AI</p>
                  <div className={CARD}>
                    {r.paragraphs.map((p, j) => (
                      <p key={j} className={PARA}>
                        {p}
                      </p>
                    ))}
                    {action ? (
                      <Link href={action.href} className={TEAL} onClick={onClose}>
                        {action[r.language]}
                      </Link>
                    ) : null}
                  </div>
                  {!handedOff && !r.offer_person ? (
                    <button type="button" onClick={() => offerPerson(r.category, r.language)} className={PERSON}>
                      {r.language === "pcm" ? "Ask person for our team" : "Ask a person instead"}
                    </button>
                  ) : null}
                </div>
              );
            }
            if (item.kind === "offer") {
              return (
                <div key={i} className="grid gap-1.5">
                  <p className={LABEL}>Toastly Help · AI</p>
                  <div className={CARD}>
                    <p className={PARA}>
                      {item.reason === "not_resolved"
                        ? item.lang === "pcm"
                          ? "E be like say I never solve dis one for you. Person for our team fit help — I go pass am give dem with wetin you don tell me here."
                          : "It looks like I haven't sorted this out for you. A person on our team can help — I'll pass it on with what you've told me here."
                        : item.lang === "pcm"
                          ? "Person for our team fit help you with dis one. I fit pass am give dem now, with wetin you don tell me here."
                          : "A person on our team can help with this. I can pass it on now, with what you've told me here."}
                    </p>
                    <button type="button" disabled={busy} onClick={() => passOn(item.category, item.reason, item.lang)} className={TEAL}>
                      {item.lang === "pcm" ? "Pass am give our team" : "Pass this to our team"}
                    </button>
                  </div>
                </div>
              );
            }
            if (item.kind === "passed") {
              return (
                <div key={i} className="grid gap-1.5">
                  <p className={LABEL}>Toastly Help · AI</p>
                  <div role="status" className="grid gap-3 rounded-[6px_16px_16px_16px] border border-green-500/[.35] bg-white p-3.5">
                    <p className="m-0 text-ui font-medium leading-[1.6] text-ink-900">
                      {item.paragraphs?.[0] ?? (item.lang === "pcm" ? "I don pass am give our team." : "I've passed this to our team.")}
                    </p>
                    {item.sla ? <p className="m-0 text-ui font-semibold leading-[1.6] text-ink-900">{item.sla}</p> : null}
                    {referenceBox(item.reference)}
                    <p className="m-0 text-[13.5px] leading-[1.55] text-grey-600">
                      You&rsquo;ll see the reply here in Toastly Help, and by email. Quote this reference if you write to us about it.
                    </p>
                    {item.paragraphs?.slice(1).map((p, j) => (
                      <p key={j} className="m-0 text-[13.5px] leading-[1.55] text-grey-600">
                        {p}
                      </p>
                    ))}
                  </div>
                </div>
              );
            }
            if (item.kind === "safety") {
              // Nigeria's 112 is always named (owner, 10 October 2026): a
              // member abroad by profile may be in Nigeria right now.
              const ng = item.emergency.some((n) => n.number === "112");
              const local = item.emergency.length ? item.emergency[0].number : "your local emergency number";
              const emergencyLine = ng
                ? "If you’re in danger right now, call 112."
                : `If you’re in danger right now, call ${local} — or 112 if you’re in Nigeria.`;
              const crisisCall = ng
                ? item.emergency.map((n) => n.number).join(" or ")
                : `${local} (112 if you’re in Nigeria)`;
              return (
                <div key={i} className="grid gap-1.5">
                  <p className={LABEL}>Toastly Help</p>
                  <div role="status" className={CARD}>
                    {item.selfHarm ? (
                      <div className="grid gap-2.5 border-b border-ink-900/[.12] pb-3.5">
                        <p className="m-0 text-ui font-semibold leading-[1.6] text-ink-900">You don&rsquo;t have to deal with this alone.</p>
                        {item.crisis.length ? (
                          <>
                            <p className={PARA}>You can talk to someone right now:</p>
                            {item.crisis.map((l) => (
                              <a key={l.name} href={l.href} className={OUTLINE}>
                                <span className="grid gap-0.5 text-center">
                                  <span className="font-semibold">{l.name}</span>
                                  <span className="text-nav font-normal text-ink-800">
                                    {l.how}: {l.contact}
                                  </span>
                                </span>
                              </a>
                            ))}
                          </>
                        ) : (
                          <p className={PARA}>
                            If you might act on these feelings, call {crisisCall} now, or
                            go to the nearest hospital. If you can, tell someone you trust how you&rsquo;re feeling.
                          </p>
                        )}
                      </div>
                    ) : null}
                    <p className="m-0 text-ui font-semibold leading-[1.6] text-ink-900">Your safety comes first.</p>
                    <p className={PARA}>{emergencyLine}</p>
                    <Link href="/safety-kit" className={TEAL} onClick={onClose}>
                      I don&rsquo;t feel safe
                    </Link>
                    <div className="grid grid-cols-2 gap-2.5">
                      <Link href="/safety-kit#report-or-block" className={OUTLINE} onClick={onClose}>
                        Block
                      </Link>
                      <Link href="/safety-kit#report-or-block" className={OUTLINE} onClick={onClose}>
                        Report
                      </Link>
                    </div>
                    {item.reference ? (
                      <>
                        <p className="m-0 mt-1 text-ui font-semibold leading-[1.6] text-ink-900">
                          {item.sla ?? "A person from our team will reply soon."}
                        </p>
                        {referenceBox(item.reference)}
                        <p className="m-0 text-[13.5px] leading-[1.55] text-grey-600">
                          We&rsquo;ve passed this to a person already. You&rsquo;ll see the reply here in Toastly Help, and by email.
                        </p>
                      </>
                    ) : (
                      <p className="m-0 text-[13.5px] leading-[1.55] text-grey-600">
                        If you don&rsquo;t hear from us, email support@trytoastly.com.
                      </p>
                    )}
                  </div>
                </div>
              );
            }
            return (
              <p key={i} role="status" className="m-0 px-0.5 text-nav text-grey-600">
                {item.text}
              </p>
            );
          })}
          {busy ? (
            <p role="status" className="m-0 px-0.5 text-nav text-grey-600">
              …
            </p>
          ) : null}
          <div ref={endRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(draft);
          }}
          className="grid gap-2 border-t border-ink-900/[.12] bg-white px-3.5 pb-3.5 pt-3"
        >
          <div className="flex gap-2">
            <label className="flex min-w-0 flex-1">
              <span className="sr-only">Your question</span>
              <input
                ref={inputRef}
                type="text"
                value={draft}
                maxLength={1000}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={lastLang === "pcm" ? "Ask anoda question" : "Ask a question"}
                className="min-h-12 w-full rounded-lg border border-ink-900/20 bg-white px-3.5 py-3 font-sans text-ui text-ink-900 focus:border-green-500 focus:outline-none focus:ring-[3px] focus:ring-green-500/[.16]"
              />
            </label>
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="min-h-12 min-w-16 flex-shrink-0 rounded-lg bg-green-500 px-3.5 py-3 text-button text-white transition-colors duration-200 hover:bg-green-600 disabled:bg-grey-200 disabled:text-grey-600"
            >
              Send
            </button>
          </div>
          <p className="m-0 text-[12.5px] leading-normal text-grey-600">
            Toastly Help never sees your messages, selfies or ID number.
          </p>
        </form>
      </div>
    </div>
  );
}

export type { Item as HelpItem };
