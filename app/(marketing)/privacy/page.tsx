import type { Metadata } from "next";
import * as React from "react";
import { notFound } from "next/navigation";
import {
  PRIVACY_CONTACT,
  PRIVACY_EFFECTIVE_DATE,
  PRIVACY_INTRO,
  PRIVACY_PUBLISHED,
  PRIVACY_SECTIONS,
  type PrivacyBlock,
} from "@/lib/privacy-content";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What Toastly collects, why, who we share it with, and the choices you have — including how your genotype, verification and Gist sessions are handled.",
  alternates: { canonical: "/privacy" },
};

// Dynamic so the publication gate is checked per request. Once the policy
// is published this can return to static.
export const dynamic = "force-dynamic";

/**
 * Privacy policy.
 *
 * NOT IN THE PROTOTYPE — flagged. No legal page exists in the approved
 * design. The header band follows the marketing pages' (safety.slim.html's
 * dark green header); the body is plain prose on paper at a readable measure,
 * using only existing tokens.
 *
 * Every contact address is a mailto link with vertical padding, so it meets
 * the 44px target bar inside running text without changing the line.
 */

const MAIL_PADDING = "py-[13px]";

/** Turns the contact address inside a sentence into a mailto link. */
function withMailto(text: string): React.ReactNode {
  const parts = text.split(PRIVACY_CONTACT);
  if (parts.length === 1) return text;
  return parts.map((part, i) => (
    <React.Fragment key={i}>
      {part}
      {i < parts.length - 1 ? (
        <a
          href={`mailto:${PRIVACY_CONTACT}`}
          className={`${MAIL_PADDING} font-semibold text-green-500 underline underline-offset-2`}
        >
          {PRIVACY_CONTACT}
        </a>
      ) : null}
    </React.Fragment>
  ));
}

function Block({ block }: { block: PrivacyBlock }) {
  if (block.kind === "p") {
    return (
      <p className="text-body text-ink-800">
        {block.lead ? (
          <strong className="font-semibold text-ink-900">{block.lead}</strong>
        ) : null}
        {block.lead && block.text ? " " : null}
        {withMailto(block.text)}
      </p>
    );
  }

  if (block.kind === "ul") {
    return (
      <ul className="grid list-disc gap-2 pl-5 text-body text-ink-800 marker:text-green-500">
        {block.items.map((item) => (
          <li key={item}>{withMailto(item)}</li>
        ))}
      </ul>
    );
  }

  // Tables scroll inside their own container, so a narrow screen never
  // scrolls the page sideways.
  return (
    <div className="overflow-x-auto rounded-lg border border-ink-900/[.12] bg-white">
      <table className="w-full min-w-[520px] border-collapse text-left text-ui">
        <thead>
          <tr className="bg-paper">
            {block.head.map((h) => (
              <th
                key={h}
                scope="col"
                className="border-b border-ink-900/[.12] px-4 py-3 text-chip font-semibold uppercase tracking-[0.08em] text-grey-600"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row) => (
            <tr key={row.join("|")} className="border-b border-ink-900/[.08] last:border-0">
              {row.map((cell, i) => (
                <td
                  key={i}
                  className={`px-4 py-3 align-top ${i === 0 ? "font-medium text-ink-900" : "text-ink-800"}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PrivacyPage() {
  // Withheld while any [placeholder] remains — a legal page must not go live
  // reading "[DATE]". The audit harness may render it to measure the layout.
  if (!PRIVACY_PUBLISHED && process.env.AUDIT_HARNESS !== "1") notFound();

  return (
    <>
      <section className="bg-green-800 text-white">
        <div className="mx-auto max-w-container px-5 py-section-y md:px-10">
          <div className="grid max-w-[760px] gap-4">
            <p className="text-caption font-semibold uppercase text-champagne">
              Privacy
            </p>
            <h1 className="text-h2 text-white">Toastly Privacy Policy</h1>
            <p className="text-ui text-white/[.78]">
              Effective date: {PRIVACY_EFFECTIVE_DATE}
            </p>
          </div>
        </div>
      </section>

      <section className="bg-paper">
        <div className="mx-auto grid max-w-measure gap-12 px-5 py-section-y md:px-0">
          <div className="grid gap-4">
            {PRIVACY_INTRO.map((b, i) => (
              <Block key={i} block={b} />
            ))}
          </div>

          {PRIVACY_SECTIONS.map((s) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="grid gap-4">
              <h2 id={`${s.id}-title`} className="text-h5 text-ink-900">
                {s.title}
              </h2>
              {s.blocks.map((b, i) => (
                <Block key={i} block={b} />
              ))}
            </section>
          ))}
        </div>
      </section>
    </>
  );
}
