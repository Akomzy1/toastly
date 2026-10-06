"use client";

import * as React from "react";
import { Reveal } from "@/components/reveal";
import { Eyebrow } from "@/components/section-parts";
import { TrackTabs } from "@/components/ui/track-tabs";
import {
  compareCols,
  compareRows,
  tableCaptions,
  trackLabels,
} from "@/lib/pricing-content";

/**
 * The feature comparison, switched by track (pricing-offer.slim.html).
 *
 * One table at a time, never both currencies blended into one — that
 * separation is the whole point of the control (SKILL.md). The table scrolls
 * horizontally inside its own container so the page body never does.
 */
export function PricingCompare() {
  const [track, setTrack] = React.useState(0);
  const cols = compareCols[track];
  const rows = compareRows[track];

  return (
    // minmax(0,1fr): without it the 640px table widens the grid track and
    // the whole page scrolls sideways on a phone.
    <div className="grid grid-cols-[minmax(0,1fr)] gap-[clamp(24px,3vw,36px)]">
      <Reveal className="flex flex-wrap items-end justify-between gap-5">
        <div className="grid max-w-[560px] gap-3.5">
          <Eyebrow>Compare</Eyebrow>
          <h2 id="p-compare" className="text-h3">
            Feature by feature, one track at a time.
          </h2>
        </div>
        <TrackTabs
          labels={trackLabels}
          value={track}
          onValueChange={setTrack}
          panelId="pricing-compare"
        />
      </Reveal>

      <Reveal>
        <div
          id="pricing-compare"
          role="region"
          aria-label="Feature comparison"
          tabIndex={0}
          className="overflow-x-auto rounded-xl border border-ink-900/[.12]"
        >
          <table className="w-full min-w-[640px] border-collapse text-ui">
            <caption className="px-[22px] pb-0 pt-5 text-left text-nav text-grey-600">
              {tableCaptions[track]}
            </caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="px-[22px] py-[18px] text-left text-caption font-semibold uppercase tracking-[0.08em] text-grey-400"
                >
                  Feature
                </th>
                {cols.map((c) => (
                  <th
                    key={c}
                    scope="col"
                    className="whitespace-nowrap px-[22px] py-[18px] text-left font-serif text-nav-lg font-bold text-ink-900"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, cells]) => (
                <tr key={label} className="border-t border-ink-900/[.08]">
                  <th
                    scope="row"
                    className="px-[22px] py-4 text-left text-ui font-medium text-ink-900"
                  >
                    {label}
                  </th>
                  {cells.map((v, i) => (
                    <td
                      key={cols[i]}
                      className="px-[22px] py-4 text-ui text-grey-600"
                    >
                      {v === "—" ? (
                        <span aria-label="Not included">&mdash;</span>
                      ) : (
                        v
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Reveal>
    </div>
  );
}
