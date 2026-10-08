/**
 * The plan numbers every screen, page, schema and help answer reads
 * (decided 8 October 2026). Nothing else may hard-code them; a constraint
 * check fails the build if these drift from the database or a number is
 * written out anywhere else.
 *
 * The database holds the same values: plan_config.starter_monthly_gists and
 * price_list.amount_minor (0035). Checkout always charges from price_list.
 */

/** Starter's Gists a month. Counts only a Gist the member started that connected. */
export const STARTER_MONTHLY_GISTS = 1;

/** "1 Gist", "3 Gists". */
export const gistCount = (n: number) => `${n} Gist${n === 1 ? "" : "s"}`;

/** Monthly plan prices, in whole units. */
export const PREMIUM_NGN = 3500;
export const PREMIUM_PLUS_NGN = 7000;
export const DIASPORA_USD = 10;
export const DIASPORA_PLUS_USD = 20;

export const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;
export const usd = (n: number) => `$${n}`;

/**
 * The plan an in-context upgrade prompt names, with its price (PRD §7.3,
 * decided 8 October 2026): Premium for members in Nigeria, Diaspora for
 * members abroad. Every upgrade prompt reads this — never a typed price.
 */
export function upgradeOffer(abroad: boolean): { plan: string; price: string } {
  return abroad
    ? { plan: "Diaspora", price: `${usd(DIASPORA_USD)} a month` }
    : { plan: "Premium", price: `${naira(PREMIUM_NGN)} a month` };
}
