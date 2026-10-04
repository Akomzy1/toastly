/**
 * Where a member lives — the countries offered in Edit profile's "Where do
 * you live?" (decided 4 October 2026). Self-declared: PRD §5.6 checks it
 * against payment and connection country, and mismatches go to review,
 * never to an automatic consequence.
 */
export const LIVE_COUNTRIES: { code: string; name: string }[] = [
  { code: "NG", name: "Nigeria" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "IE", name: "Ireland" },
  { code: "DE", name: "Germany" },
  { code: "NL", name: "Netherlands" },
  { code: "BE", name: "Belgium" },
  { code: "FR", name: "France" },
  { code: "IT", name: "Italy" },
  { code: "ES", name: "Spain" },
  { code: "SE", name: "Sweden" },
  { code: "CH", name: "Switzerland" },
  { code: "ZA", name: "South Africa" },
  { code: "GH", name: "Ghana" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "QA", name: "Qatar" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "AU", name: "Australia" },
  { code: "CN", name: "China" },
  { code: "MY", name: "Malaysia" },
];

export const COUNTRY_NAME: Record<string, string> = Object.fromEntries(LIVE_COUNTRIES.map((c) => [c.code, c.name]));

export const isLiveCountry = (code: string) => LIVE_COUNTRIES.some((c) => c.code === code);
