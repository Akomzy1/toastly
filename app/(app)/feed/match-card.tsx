import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SafetyActions } from "@/components/safety/safety-actions";
import type { FeedCandidate } from "@/lib/feed";
import { GenotypeChip } from "@/components/genotype/genotype-chip";

/**
 * A match card.
 *
 * NOT IN THE PROTOTYPE — flagged. Home's prompt cards show the intended
 * shape (avatar, name, one prompt and its answer) but there is no in-app
 * feed card in the approved design.
 *
 * Three rules are structural here, not decorative:
 *   - answers sit ABOVE any photography, because members read intentions
 *     rather than score faces;
 *   - a reply must be attached to one specific answer — tapping an answer
 *     opens the reply screen for it (gist-invite prototypes 1–3), and there
 *     is no way to reply or invite without one;
 *   - there is no swipe gesture, no like button, no super-like, and no
 *     heart or flame anywhere.
 */
export function MatchCard({
  candidate,
}: {
  candidate: FeedCandidate;
}) {
  return (
    <Card className="grid content-start gap-5 p-[26px]">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-h5 text-ink-900">{candidate.display_name}</h2>
        <Badge variant="verified">Verified Real</Badge>
        {candidate.stage === "id_confirmed" ? (
          <Badge variant="nin">NIN confirmed</Badge>
        ) : null}
        {candidate.city ? (
          <span className="text-nav text-grey-600">{candidate.city}</span>
        ) : null}
        {/* NOT IN THE PROTOTYPE — flagged: the way into the full profile
            (PRD §5.2.4). Viewing it is never recorded. */}
        <Link href={`/members/${candidate.id}`} className="inline-flex min-h-11 basis-full items-center text-nav font-semibold text-green-500">
          See {candidate.display_name.split(" ")[0]}&rsquo;s full profile
        </Link>
      </div>

      {/* Answers first. This ordering is the product. */}
      <ul className="grid list-none gap-3 p-0">
        {candidate.answers.map((a) => (
          <li key={a.id}>
            <Link
              href={`/feed/reply/${a.id}`}
              className="grid w-full gap-1.5 rounded-lg border border-ink-900/[.12] bg-white p-4 text-left no-underline transition-colors duration-200 hover:border-green-500/50"
            >
              <span className="text-caption font-semibold uppercase text-green-500">{a.prompt}</span>
              <span className="text-ui text-ink-900">{a.answer}</span>
              <span className="text-caption tracking-normal text-grey-400">Reply to this answer</span>
            </Link>
          </li>
        ))}
      </ul>

      {candidate.tags.length || candidate.genotype ? (
        <div className="flex flex-wrap gap-2">
          {candidate.tags.map((t) => (
            <Badge key={t} variant="optional">
              {t}
            </Badge>
          ))}
          {candidate.genotype ? (
            <GenotypeChip value={candidate.genotype} ground="white" />
          ) : null}
        </div>
      ) : null}

      {/* Report and block, on every card, for every member. This component
          takes no plan and must never be given one. */}
      <SafetyActions memberId={candidate.id} name={candidate.display_name} />
    </Card>
  );
}
