"use client";

import * as React from "react";
import Link from "next/link";

/**
 * Toastly Help — toastly-help.slim.html and toastly-help-handoff.slim.html.
 *
 * The AI label sits under the title every time it opens. No avatar, name or
 * persona: replies are labelled "Toastly Help · AI". A reply can carry one
 * teal action. It answers in the language you write in. Refunds, disputes
 * and appeals go to a person: one button passes it on, then a reference the
 * member can copy confirms it.
 *
 * NOT IN THE PROTOTYPES — flagged: the safety card (shown when a member
 * describes danger or distress) and the "Toastly Help" button that opens the
 * panel. Both are built from the panel's own cards and buttons.
 */

type Action = "none" | "retry_selfie" | "check_id" | "payment" | "coins" | "safety_kit";
type Lang = "en" | "pcm";
type Reply = { paragraphs: string[]; action: Action; handoff: string | null; safety: boolean; language: Lang };

type Item =
  | { kind: "member"; text: string }
  | { kind: "reply"; reply: Reply }
  | { kind: "offer"; category: string; lang: Lang }
  | { kind: "passed"; reference: string }
  | { kind: "safety" }
  | { kind: "error"; text: string };

const ACTIONS: Record<Exclude<Action, "none">, { href: string; en: string; pcm: string }> = {
  retry_selfie: { href: "/verify", en: "Try the selfie again", pcm: "Try di selfie again" },
  check_id: { href: "/verify", en: "Check my ID", pcm: "Check my ID" },
  payment: { href: "/profile/plan", en: "Try the payment again", pcm: "Try di payment again" },
  coins: { href: "/coins", en: "See your coins", pcm: "Check your coins" },
  safety_kit: { href: "/safety-kit", en: "Open your safety kit", pcm: "Open your safety kit" },
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
const PERSON =
  "inline-flex min-h-11 items-center justify-self-start px-0.5 text-nav font-medium text-green-500 underline underline-offset-4";

export function HelpPanel({
  open,
  onClose,
  initialItems = [],
}: {
  open: boolean;
  onClose: () => void;
  /** For the /audit harness only. */
  initialItems?: Item[];
}) {
  const [items, setItems] = React.useState<Item[]>(initialItems);
  const [draft, setDraft] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [items]);

  if (!open) return null;

  const lastLang: Lang =
    ([...items].reverse().find((i) => i.kind === "reply") as { reply: Reply } | undefined)?.reply.language ?? "en";

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setDraft("");
    setBusy(true);
    setItems((prev) => [...prev, { kind: "member", text: message }]);
    try {
      const res = await fetch("/api/help", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId, message }),
      });
      const json = (await res.json()) as { conversation_id?: string; reply?: Reply; error?: string };
      if (json.conversation_id) setConversationId(json.conversation_id);
      if (!res.ok || !json.reply) {
        setItems((prev) => [...prev, { kind: "error", text: json.error ?? "Something went wrong. Please try again." }]);
      } else if (json.reply.safety) {
        setItems((prev) => [...prev, { kind: "safety" }]);
      } else {
        setItems((prev) => [...prev, { kind: "reply", reply: json.reply! }]);
      }
    } catch {
      setItems((prev) => [...prev, { kind: "error", text: "You seem to be offline. Please try again." }]);
    }
    setBusy(false);
  }

  function offerPerson(category: string, lang: Lang) {
    setItems((prev) => (prev.some((i) => i.kind === "offer" || i.kind === "passed") ? prev : [...prev, { kind: "offer", category, lang }]));
  }

  async function passOn(category: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/help/handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId, category }),
      });
      const json = (await res.json()) as { reference?: string; error?: string };
      setItems((prev) => [
        ...prev.filter((i) => i.kind !== "offer"),
        json.reference ? { kind: "passed", reference: json.reference } : { kind: "error", text: json.error ?? "We couldn't pass this on. Email support@trytoastly.com." },
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
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  const handedOff = items.some((i) => i.kind === "passed");

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
                    {r.handoff && !handedOff ? (
                      <button type="button" disabled={busy} onClick={() => passOn(r.handoff!)} className={TEAL}>
                        {r.language === "pcm" ? "Pass am give our team" : "Pass this to our team"}
                      </button>
                    ) : null}
                  </div>
                  {!r.handoff && !handedOff ? (
                    <button type="button" onClick={() => offerPerson("other", r.language)} className={PERSON}>
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
                      {item.lang === "pcm"
                        ? "Person for our team fit help you with dis one. I fit pass am give dem now, with wetin you don tell me here."
                        : "A person on our team can help with this. I can pass it on now, with what you've told me here."}
                    </p>
                    <button type="button" disabled={busy} onClick={() => passOn(item.category)} className={TEAL}>
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
                      I&rsquo;ve passed this to our team. You&rsquo;ll get a reply by email.
                    </p>
                    <div className="flex items-center justify-between gap-2.5 rounded-lg bg-green-50 py-3 pl-3.5 pr-3">
                      <span className="grid min-w-0 gap-0.5">
                        <span className="font-sans text-chip font-semibold uppercase tracking-[0.12em] text-green-500">Reference</span>
                        <span className="text-[17px] font-semibold tabular-nums tracking-[0.04em] text-ink-900">{item.reference}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => copy(item.reference)}
                        className="min-h-11 flex-shrink-0 rounded-md border border-ink-900/20 bg-white px-3.5 py-2.5 text-nav font-semibold text-ink-900 hover:border-green-500"
                      >
                        {copied ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <p className="m-0 text-[13.5px] leading-[1.55] text-grey-600">
                      The reply goes to the email on your account. Quote this reference if you write to us about it.
                    </p>
                  </div>
                </div>
              );
            }
            if (item.kind === "safety") {
              return (
                <div key={i} className="grid gap-1.5">
                  <p className={LABEL}>Toastly Help</p>
                  <div role="status" className={CARD}>
                    <p className="m-0 text-ui font-semibold leading-[1.6] text-ink-900">Your safety comes first.</p>
                    <p className={PARA}>
                      If you&rsquo;re in danger right now, call 112 in Nigeria, or your local emergency number if
                      you&rsquo;re abroad.
                    </p>
                    <p className={PARA}>
                      Your safety kit has the panic button and share-your-date. A person on our team can also look
                      at this with you.
                    </p>
                    <Link href="/safety-kit" className={TEAL} onClick={onClose}>
                      Open your safety kit
                    </Link>
                    {!handedOff ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => passOn("safety")}
                        className="min-h-12 w-full rounded-lg border border-ink-900/20 bg-transparent px-4 py-3 text-button text-ink-900 hover:border-green-500 hover:bg-green-50"
                      >
                        Pass this to our team
                      </button>
                    ) : null}
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
