"use client";

import * as React from "react";
import { Input, Label } from "@/components/ui/field";
import { cmToFtIn, ftInToCm, formatHeight, heightInRange, HEIGHT_MAX_CM, HEIGHT_MIN_CM } from "@/lib/height";

/**
 * Height (PRD §5.2): cm, or feet and inches with a toggle; stored in cm.
 *
 * PLAIN VERSION, NOT IN THE PROTOTYPE — flagged; restyled when the Claude
 * Design screen arrives. Optional, self-reported, never labelled verified,
 * shown on the full profile only, never filterable and never a score term.
 */
export function HeightField({ defaultCm }: { defaultCm: number | null }) {
  const start = defaultCm !== null ? cmToFtIn(defaultCm) : { ft: NaN, inch: NaN };
  const [unit, setUnit] = React.useState<"cm" | "ftin">("cm");
  const [cm, setCm] = React.useState<string>(defaultCm !== null ? String(defaultCm) : "");
  const [ft, setFt] = React.useState<string>(Number.isNaN(start.ft) ? "" : String(start.ft));
  const [inch, setInch] = React.useState<string>(Number.isNaN(start.inch) ? "" : String(start.inch));

  // What is saved: always centimetres.
  const stored = unit === "cm" ? (cm === "" ? null : Number(cm)) : ft === "" && inch === "" ? null : ftInToCm(Number(ft || 0), Number(inch || 0));
  const bad = stored !== null && !heightInRange(stored);

  function switchTo(next: "cm" | "ftin") {
    if (next === unit) return;
    if (next === "ftin" && cm !== "" && heightInRange(Number(cm))) {
      const v = cmToFtIn(Number(cm));
      setFt(String(v.ft));
      setInch(String(v.inch));
    }
    if (next === "cm" && stored !== null && Number.isFinite(stored)) setCm(String(stored));
    setUnit(next);
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-ui font-medium text-ink-900">Height</span>
        <div role="group" aria-label="Height unit" className="inline-flex overflow-hidden rounded-pill border border-ink-900/20 text-caption">
          {(["cm", "ftin"] as const).map((u) => (
            <button
              key={u}
              type="button"
              aria-pressed={unit === u}
              onClick={() => switchTo(u)}
              className={`min-h-11 px-3.5 font-semibold ${unit === u ? "bg-green-800 text-white" : "bg-transparent text-grey-600"}`}
            >
              {u === "cm" ? "cm" : "ft / in"}
            </button>
          ))}
        </div>
      </div>
      {unit === "cm" ? (
        <Label htmlFor="height_cm_input" className="text-caption tracking-normal">
          Centimetres
          <Input id="height_cm_input" type="number" inputMode="numeric" min={HEIGHT_MIN_CM} max={HEIGHT_MAX_CM} value={cm} onChange={(e) => setCm(e.target.value)} placeholder="170" />
        </Label>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Label htmlFor="height_ft_input" className="text-caption tracking-normal">
            Feet
            <Input id="height_ft_input" type="number" inputMode="numeric" min={3} max={7} value={ft} onChange={(e) => setFt(e.target.value)} placeholder="5" />
          </Label>
          <Label htmlFor="height_in_input" className="text-caption tracking-normal">
            Inches
            <Input id="height_in_input" type="number" inputMode="numeric" min={0} max={11} value={inch} onChange={(e) => setInch(e.target.value)} placeholder="7" />
          </Label>
        </div>
      )}
      <input type="hidden" name="height_cm" value={stored === null || !Number.isFinite(stored) ? "" : String(stored)} />
      <span className={`text-caption ${bad ? "text-error" : "text-grey-600"}`}>
        {bad
          ? `Height needs to be between ${HEIGHT_MIN_CM} and ${HEIGHT_MAX_CM} cm.`
          : stored !== null && Number.isFinite(stored)
            ? `Shown as ${formatHeight(stored)}. You say it yourself; it isn't checked.`
            : "Optional. Shown on your full profile only, never on your card."}
      </span>
    </div>
  );
}
