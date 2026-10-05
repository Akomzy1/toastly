"use client";

import { cn } from "@/lib/utils";

/** The radio cards the coins prototypes use for packs and payment methods. */
export function Choice<T extends string>({
  label,
  name,
  options,
  value,
  onChange,
}: {
  label: string;
  name: string;
  options: { id: T; title: string; sub?: string; aside?: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2.5">
      <p className="px-0.5 text-chip font-semibold uppercase tracking-[0.12em] text-grey-600">{label}</p>
      <input type="hidden" name={name} value={value ?? ""} />
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.id)}
            className={cn(
              "flex min-h-14 items-center justify-between gap-3 rounded-lg border px-[15px] py-3 text-left",
              on ? "border-green-500 bg-green-50" : "border-ink-900/[.14] bg-white hover:border-green-500/50",
            )}
          >
            <span className="grid min-w-0 gap-0.5">
              <span className="text-ui font-semibold text-ink-900">{o.title}</span>
              {o.sub ? <span className="text-[13px] text-grey-600">{o.sub}</span> : null}
            </span>
            {o.aside ? (
              <span className="flex-shrink-0 text-ui font-semibold tabular-nums text-ink-900">{o.aside}</span>
            ) : (
              <span
                aria-hidden="true"
                className={cn(
                  "grid h-5 w-5 flex-shrink-0 place-items-center rounded-pill border-[1.5px]",
                  on ? "border-green-500 bg-green-500" : "border-grey-400",
                )}
              >
                {on ? <span className="h-2 w-2 rounded-pill bg-white" /> : null}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
