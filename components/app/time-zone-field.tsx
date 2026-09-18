"use client";

import * as React from "react";
import { Select } from "@/components/ui/field";
import { TIME_ZONES } from "@/lib/scheduling";

/**
 * Time-zone select — built against design/prototype/time-zone.slim.html.
 *
 * The prototype pre-fills from the device and says so in a pill, then offers
 * "Use detected zone" once the member changes it. Detection happens in an
 * effect AFTER mount rather than during render: reading the browser's zone
 * while rendering disagrees with what the server rendered and breaks
 * hydration, which is why the earlier version used a bare select.
 *
 * Behaviour unchanged: the zone is display and scheduling only, never a
 * matching input, and blank stays a first-class answer.
 */
export function TimeZoneField({
  name = "time_zone",
  defaultValue,
}: {
  name?: string;
  defaultValue?: string | null;
}) {
  const [detected, setDetected] = React.useState<string | null>(null);
  const [value, setValue] = React.useState(defaultValue ?? "");

  React.useEffect(() => {
    try {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!zone) return;
      setDetected(zone);
      // Only pre-fill an empty field; never overwrite a member's own choice.
      setValue((current) => (current === "" && known(zone) ? zone : current));
    } catch {
      // A browser that won't report a zone simply gets no pre-fill.
    }
  }, []);

  const known = (zone: string) => TIME_ZONES.some((z) => z.value === zone);
  const label = (zone: string | null) =>
    TIME_ZONES.find((z) => z.value === zone)?.label ?? zone ?? "";

  const isDetected = Boolean(detected) && value === detected;
  const isChanged = Boolean(detected) && value !== "" && value !== detected;

  return (
    <label className="grid gap-[7px] font-sans text-nav font-medium text-ink-900">
      Your time zone <span className="text-grey-400">(optional)</span>
      <Select
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="min-h-12"
      >
        <option value="">Rather not say</option>
        {TIME_ZONES.map((z) => (
          <option key={z.value} value={z.value}>
            {z.label}
          </option>
        ))}
      </Select>

      {isDetected ? (
        <span className="inline-flex items-center gap-[7px] justify-self-start rounded-pill border border-green-500/[.24] bg-green-50 px-[13px] py-[7px] text-nav font-semibold text-green-550">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="8.4" stroke="#00695C" strokeWidth="1.5" />
            <path d="M12 7.6V12l3 2" stroke="#00695C" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          Detected from your device
        </span>
      ) : null}

      {isChanged ? (
        <span className="flex items-start gap-2 text-nav leading-relaxed text-grey-600">
          <span aria-hidden="true" className="mt-[3px] flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M4 9h12a4 4 0 0 1 0 8H9" stroke="#828184" strokeWidth="1.6" strokeLinecap="round" />
              <path d="m7 6 3 3-3 3" stroke="#828184" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          Changed from your detected zone, {label(detected)}.
        </span>
      ) : null}

      <span className="text-nav leading-relaxed text-grey-600">
        We&rsquo;ll use this so Gist times show correctly for both of you.
      </span>
    </label>
  );
}
