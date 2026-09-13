import { capabilities } from "@/lib/entitlements";
import type { Tier } from "@/lib/types/profile";

/**
 * The locked inbox.
 *
 * CLAUDE.md: Starter members CAN receive messages and see only a bare count —
 * "1 new message" / "3 new messages" — with no sender name, no photo, and no
 * preview of any kind. Content stays locked at the API layer, not merely
 * hidden in the UI.
 *
 * The types below encode that difference so it cannot be fudged: a locked
 * inbox is representable ONLY as a number. There is no optional `sender`, no
 * nullable `preview`, no `blurredBody`. If a field like that ever appears
 * here, the leak has already happened in the payload.
 */

export type LockedInbox = {
  kind: "locked";
  /** The only thing a Starter member may learn. */
  unreadCount: number;
};

export type OpenInbox = {
  kind: "open";
  threads: {
    id: string;
    otherMemberName: string;
    lastMessage: string;
    lastAt: string;
    unread: number;
  }[];
};

export type Inbox = LockedInbox | OpenInbox;

export function canReadInbox(tier: Tier): boolean {
  return capabilities(tier).readInbox;
}

/** "1 new message" / "3 new messages". The prototype's exact wording. */
export function lockedLabel(count: number): string {
  return count === 1 ? "1 new message" : `${count} new messages`;
}

/**
 * Copy for the locked state.
 *
 * Framed as a paid feature with a plain explanation, never as an error, a
 * broken state or an unexplained blank — and with no countdown, no "expires
 * soon", no fabricated scarcity (Prompt 6).
 */
export const LOCKED_COPY = {
  rowLabel: "Unlock with Premium to view",
  title: "New message waiting.",
  body: "Premium unlocks your inbox — see who's messaged you and reply, with unlimited Gist sessions too.",
  cta: "Unlock with Premium",
  dismiss: "Not now",
} as const;
