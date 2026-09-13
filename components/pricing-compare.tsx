"use client";

import * as React from "react";
import { TrackTabs } from "@/components/ui/track-tabs";
import {
  compareCols,
  compareRows,
  tableCaptions,
  trackLabels,
} from "@/lib/pricing-content";

/**
 * The feature comparison, switched by track.
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
    <>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="grid max-w-measure gap-3.5">
          <p className="text-caption font-semibold uppercase text-green-500">
            Compare
          </p>
          <h2 className="text-h2 text-ink-900">
            Feature by feature, one track at a time.
          </h2>
        </div>
        <TrackTabs
          labels={trackLabels}
          value={track}
          onValueChange={setTrack}
          panelId="pricing-compare"
        />
      </div>

      <div
        id="pricing-compare"
        role="region"
        aria-label="Feature comparison"
        tabIndex={0}
        className="mt-8 overflow-x-auto rounded-xl border border-ink-900/[.12]"
      >
        <table className="w-full min-w-[640px] border-collapse text-ui">
          <caption className="px-[22px] pb-0 pt-5 text-left text-nav text-grey-600">
            {tableCaptions[track]}
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="border-b border-ink-900/[.12] px-[22px] py-4 text-left text-caption font-semibold uppercase text-grey-600"
              >
                Feature
              </th>
              {cols.map((c) => (
                <th
                  key={c}
                  scope="col"
                  className="border-b border-ink-900/[.12] px-[22px] py-4 text-left text-ui font-semibold text-ink-900"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, cells]) => (
              <tr key={label}>
                <th
                  scope="row"
                  className="border-b border-ink-900/[.08] px-[22px] py-4 text-left text-ui font-normal text-grey-600"
                >
                  {label}
                </th>
                {cells.map((v, i) => (
                  <td
                    key={cols[i]}
                    className="border-b border-ink-900/[.08] px-[22px] py-4 text-ui text-ink-900"
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
    </>
  );
}
