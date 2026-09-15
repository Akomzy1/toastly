import { BlockButton } from "./block-button";
import { ReportForm } from "./report-form";

/**
 * Report and block, attached to a member.
 *
 * A native <details> disclosure: keyboard- and screen-reader-accessible with
 * no JavaScript, and nothing downloaded until it is opened. Never behind a
 * plan check — this component takes no plan, and must never be given one.
 */
export function SafetyActions({ memberId, name }: { memberId: string; name: string }) {
  return (
    <details className="border-t border-ink-900/[.12] pt-2">
      <summary className="flex min-h-11 cursor-pointer list-none items-center text-nav font-medium text-grey-600 hover:text-ink-900 [&::-webkit-details-marker]:hidden">
        Report or block {name}
      </summary>
      <div className="mt-3 grid gap-5">
        <ReportForm memberId={memberId} name={name} />
        <BlockButton memberId={memberId} name={name} />
      </div>
    </details>
  );
}
