import { BlockButton } from "./block-button";
import { ReportForm } from "./report-form";
import { NotForMe } from "@/components/feed/not-for-me";

/**
 * Report and block, attached to a member.
 *
 * A native <details> disclosure: keyboard- and screen-reader-accessible with
 * no JavaScript, and nothing downloaded until it is opened. Never behind a
 * plan check — this component takes no plan, and must never be given one.
 *
 * With `pass`, it is the card's ⋯ menu (PRD §5.2.5): "Not for me" first, then
 * Report and Block as their own separate items. A pass is not a block and not
 * a report. Plain version until the design arrives.
 */
export function SafetyActions({ memberId, name, pass = false }: { memberId: string; name: string; pass?: boolean }) {
  return (
    <details className="border-t border-ink-900/[.12] pt-2">
      <summary className="flex min-h-11 cursor-pointer list-none items-center text-nav font-medium text-grey-600 hover:text-ink-900 [&::-webkit-details-marker]:hidden">
        {pass ? "⋯ More" : `Report or block ${name}`}
      </summary>
      <div className="mt-3 grid gap-5">
        {pass ? <NotForMe memberId={memberId} name={name} /> : null}
        <ReportForm memberId={memberId} name={name} />
        <BlockButton memberId={memberId} name={name} />
      </div>
    </details>
  );
}
