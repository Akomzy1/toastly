import {
  GENOTYPE_LABELS,
  GENOTYPE_UNKNOWN_FOR_OTHERS,
  type GenotypeValue,
} from "@/lib/genotype";

/**
 * The genotype fact chip — built against genotype-display.slim.html.
 *
 * "Genotype: AS", in the fact-chip style: 13.5px Inter 500, ink 800. Every
 * value renders identically — no icon, no colour change, nothing beside it.
 * That sameness is the most important visual rule on these screens: a red
 * SS or a green AA would be a compatibility verdict by other means.
 *
 * `ground` is the surface it sits on. The prototype puts the chip on paper
 * when the card is white, and on white against the paper page — otherwise a
 * paper chip on a paper page simply vanishes.
 *
 * Pure: it renders a value it is given and fetches nothing, so it is safe in
 * client components. Obtaining the value is genotype-data.ts's job.
 */
export function GenotypeChip({
  value,
  ground = "white",
}: {
  value: GenotypeValue;
  ground?: "white" | "paper";
}) {
  const text =
    value === "unknown" ? GENOTYPE_UNKNOWN_FOR_OTHERS : GENOTYPE_LABELS[value];

  return (
    <span
      className={`rounded-pill px-3 py-[7px] text-[13.5px] font-medium text-ink-800 ${
        ground === "white" ? "bg-paper" : "bg-white"
      }`}
    >
      Genotype: {text}
    </span>
  );
}
