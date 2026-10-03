/**
 * Redact free text before it reaches a model (CLAUDE.md agent rule 5).
 *
 * This masks the OUTBOUND COPY only: the member's text is stored and shown to
 * them unchanged, nothing is flagged or blocked, and nobody is told. It is
 * not chat moderation — member-to-member messages never reach an agent at
 * all, and are never scanned for contact details (CLAUDE.md).
 *
 * What it masks: email addresses, web links, and runs of 7+ digits (phone
 * numbers, account numbers, NIN/BVN-length numbers, card numbers).
 */
export function redact(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\bhttps?:\/\/\S+|\bwww\.\S+/gi, "[link]")
    .replace(/(?:\+?\d[\s-]?){7,}/g, "[number]");
}
