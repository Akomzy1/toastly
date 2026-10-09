import type { CrisisLine } from "@/lib/crisis-lines";
import type { EmergencyNumber } from "@/lib/safety";
import type { Handoff, HelpCategory } from "@/lib/help-escalation";

/** What /api/help returns for one member message — shared by the route and the panel. */
export type HelpAnswer = {
  language: "en" | "pcm";
  paragraphs: string[];
  action: "none" | "retry_selfie" | "check_id" | "payment" | "coins";
  handoff: Handoff;
  category: HelpCategory;
  /** A ticket filed (or already open) for this conversation, with the reply-time line. */
  ticket: { reference: string; sla: string } | null;
  /** Offer a person the member can tap: no answer, or not resolved after N turns. */
  offer_person: boolean;
  /** Show the safety tools now: I don't feel safe, Block, Report. */
  safety: boolean;
  /** Self-harm only: reviewed crisis lines for the member's country (may be empty). */
  crisis: CrisisLine[] | null;
  /** With the safety tools: emergency numbers for the member's country. */
  emergency: EmergencyNumber[];
};

/** A reply from the team, as the member sees it — never who on the team wrote it. */
export type TeamReply = { id: string; ticket_id: string; reference: string; body: string; created_at: string; read: boolean };
