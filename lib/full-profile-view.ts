/**
 * The full profile's view model and labels (PRD §5.2.4) — no data access, so
 * the client component can import it. lib/full-profile.ts fills it in.
 */

export type FullProfileOrigin = "six" | "matched" | "invite" | "reached_out";

export type FullProfileView = {
  id: string;
  name: string;
  first: string;
  age: number | null;
  city: string | null;
  origin: FullProfileOrigin;
  photos: { id: string; url: string }[];
  idChecked: boolean;
  intent: string | null;
  answers: { id: string; prompt: string; answer: string }[];
  /** What each answer offers: a text reply (paid), a Gist (Starter, from the six), or nothing. */
  action: "reply" | "gist" | "none";
  gistsLeft: number | null;
  details: { label: string; value: string; verified?: boolean }[];
  /** An open invitation from this member to the viewer. */
  invite: { sessionId: string; starter: boolean } | null;
};

const ORIGIN_SUB: Record<FullProfileOrigin, string> = {
  six: "Today's six",
  matched: "Matched",
  invite: "Gist invitation",
  // NOT IN THE PROTOTYPE — flagged: someone who replied to the viewer's
  // answer, outside the six and before a match.
  reached_out: "Replied to your answer",
};

export const originSub = (o: FullProfileOrigin) => ORIGIN_SUB[o];

/** Where "back" goes, by where the profile was opened from. */
export function backFor(view: Pick<FullProfileView, "origin" | "invite">): string {
  if (view.invite) return `/gist/${view.invite.sessionId}`;
  return view.origin === "six" ? "/feed" : view.origin === "matched" ? "/gist" : "/inbox";
}
