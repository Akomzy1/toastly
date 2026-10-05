/**
 * Database rule tests.
 *
 *   npm run test:db
 *
 * Applies every migration to a throwaway PostgreSQL (no Docker, nothing
 * hosted) and calls the database as members — the way a raw API request
 * would — to prove the rules hold where they are enforced, not just in the
 * app. A failure here is a product-rule violation, like check-constraints.
 */
import { startDatabase } from "./stack.mjs";
import { harness } from "./harness.mjs";

const SUITES = ["./live-guard.test.mjs", "./phone-and-continue.test.mjs", "./photos.test.mjs", "./data-rights.test.mjs", "./consent-onboarding.test.mjs", "./review.test.mjs", "./coins-dates.test.mjs", "./abroad-brief.test.mjs"];

const { db, stop, migrations } = await startDatabase();
console.log(`${migrations} migrations applied to a throwaway database`);

const t = harness(db);
let crashed = null;
try {
  for (const suite of SUITES) {
    await (await import(suite)).default(t);
  }
} catch (e) {
  crashed = e;
} finally {
  await stop();
}

const failed = t.report();
if (crashed) {
  console.error(`\nA suite crashed before finishing: ${crashed.stack ?? crashed}`);
  process.exit(1);
}
process.exit(failed ? 1 : 0);
