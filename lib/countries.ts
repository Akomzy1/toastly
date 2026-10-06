/**
 * Where a member lives — the countries offered on the where-you-live
 * screens (where-you-live, where-you-live-confirm, where-you-live-settings
 * prototypes): four shown first, then "Somewhere else" opens a search over
 * the rest. Self-declared: PRD §5.6 checks it against the phone's country
 * code and payment and connection country, and mismatches go to review,
 * never to an automatic consequence.
 *
 * Mirrors public.residence_countries (migration 0027); a constraint check
 * keeps the two in step. `callingCode` is digits only.
 */
export type ResidenceCountry = { code: string; name: string; callingCode: string };

/** The four choices shown first, in the prototype's order. */
export const TOP_COUNTRIES: ResidenceCountry[] = [
  { code: "NG", name: "Nigeria", callingCode: "234" },
  { code: "GB", name: "United Kingdom", callingCode: "44" },
  { code: "US", name: "United States", callingCode: "1" },
  { code: "CA", name: "Canada", callingCode: "1" },
];

/** "Somewhere else" — the prototype's list, alphabetical. */
export const OTHER_COUNTRIES: ResidenceCountry[] = [
  { code: "AU", name: "Australia", callingCode: "61" },
  { code: "AT", name: "Austria", callingCode: "43" },
  { code: "BE", name: "Belgium", callingCode: "32" },
  { code: "BJ", name: "Benin", callingCode: "229" },
  { code: "BW", name: "Botswana", callingCode: "267" },
  { code: "BR", name: "Brazil", callingCode: "55" },
  { code: "CM", name: "Cameroon", callingCode: "237" },
  { code: "CN", name: "China", callingCode: "86" },
  { code: "CI", name: "Côte d'Ivoire", callingCode: "225" },
  { code: "DK", name: "Denmark", callingCode: "45" },
  { code: "FI", name: "Finland", callingCode: "358" },
  { code: "FR", name: "France", callingCode: "33" },
  { code: "GM", name: "Gambia", callingCode: "220" },
  { code: "DE", name: "Germany", callingCode: "49" },
  { code: "GH", name: "Ghana", callingCode: "233" },
  { code: "IN", name: "India", callingCode: "91" },
  { code: "IE", name: "Ireland", callingCode: "353" },
  { code: "IT", name: "Italy", callingCode: "39" },
  { code: "JM", name: "Jamaica", callingCode: "1876" },
  { code: "JP", name: "Japan", callingCode: "81" },
  { code: "KE", name: "Kenya", callingCode: "254" },
  { code: "LR", name: "Liberia", callingCode: "231" },
  { code: "MY", name: "Malaysia", callingCode: "60" },
  { code: "NL", name: "Netherlands", callingCode: "31" },
  { code: "NZ", name: "New Zealand", callingCode: "64" },
  { code: "NO", name: "Norway", callingCode: "47" },
  { code: "PL", name: "Poland", callingCode: "48" },
  { code: "PT", name: "Portugal", callingCode: "351" },
  { code: "QA", name: "Qatar", callingCode: "974" },
  { code: "RW", name: "Rwanda", callingCode: "250" },
  { code: "SA", name: "Saudi Arabia", callingCode: "966" },
  { code: "SN", name: "Senegal", callingCode: "221" },
  { code: "SL", name: "Sierra Leone", callingCode: "232" },
  { code: "SG", name: "Singapore", callingCode: "65" },
  { code: "ZA", name: "South Africa", callingCode: "27" },
  { code: "KR", name: "South Korea", callingCode: "82" },
  { code: "ES", name: "Spain", callingCode: "34" },
  { code: "SE", name: "Sweden", callingCode: "46" },
  { code: "CH", name: "Switzerland", callingCode: "41" },
  { code: "TG", name: "Togo", callingCode: "228" },
  { code: "TT", name: "Trinidad and Tobago", callingCode: "1868" },
  { code: "TR", name: "Türkiye", callingCode: "90" },
  { code: "UG", name: "Uganda", callingCode: "256" },
  { code: "AE", name: "United Arab Emirates", callingCode: "971" },
];

export const LIVE_COUNTRIES: ResidenceCountry[] = [...TOP_COUNTRIES, ...OTHER_COUNTRIES];

export const COUNTRY_NAME: Record<string, string> = Object.fromEntries(LIVE_COUNTRIES.map((c) => [c.code, c.name]));

export const isLiveCountry = (code: string) => LIVE_COUNTRIES.some((c) => c.code === code);

/**
 * The pre-selected guess from a phone number's country code, or Nigeria when
 * there's nothing to go on. Longest code wins (+1 876 is Jamaica, not the
 * US); +1 on its own is the United States, as the prototype shows. Only a
 * guess: the member must confirm it.
 */
export function guessCountryFromPhone(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return "NG";
  const match = LIVE_COUNTRIES.filter((c) => digits.startsWith(c.callingCode)).sort(
    (a, b) => b.callingCode.length - a.callingCode.length || (a.code === "US" ? -1 : 1),
  )[0];
  return match?.code ?? "NG";
}

/** "the United Kingdom", "Ghana" — for sentences. */
export function countryInSentence(code: string): string {
  const name = COUNTRY_NAME[code] ?? code;
  return ["GB", "US", "AE", "NL"].includes(code) ? `the ${name}` : name;
}
