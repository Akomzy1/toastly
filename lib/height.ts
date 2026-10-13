/**
 * Height (PRD §5.2): entered in cm or feet and inches, stored in cm (120–220),
 * shown on the full profile in both. Self-reported, never labelled verified.
 * Display only: never filterable, never a score term.
 */

export const HEIGHT_MIN_CM = 120;
export const HEIGHT_MAX_CM = 220;

export function cmToFtIn(cm: number): { ft: number; inch: number } {
  const totalInches = Math.round(cm / 2.54);
  return { ft: Math.floor(totalInches / 12), inch: totalInches % 12 };
}

export function ftInToCm(ft: number, inch: number): number {
  return Math.round((ft * 12 + inch) * 2.54);
}

/** "5′7″ · 170 cm" */
export function formatHeight(cm: number): string {
  const { ft, inch } = cmToFtIn(cm);
  return `${ft}′${inch}″ · ${cm} cm`;
}

export function heightInRange(cm: number): boolean {
  return Number.isInteger(cm) && cm >= HEIGHT_MIN_CM && cm <= HEIGHT_MAX_CM;
}
