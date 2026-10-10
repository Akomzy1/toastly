/**
 * After sign-in, back to where it was asked for — on this site only
 * (lib/safe-next.ts). A staff alert's link lands on the ticket; nothing can
 * use the login page to send someone to another site.
 *
 *   node --test scripts/safe-next.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { safeNext } from "../lib/safe-next.ts";

test("paths on this site are kept", () => {
  assert.equal(safeNext("/staff/support/TH-55147"), "/staff/support/TH-55147");
  assert.equal(safeNext("/staff"), "/staff");
  assert.equal(safeNext("/feed?x=1"), "/feed?x=1");
});

test("anything that could leave the site falls back", () => {
  for (const bad of [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "/%2F%2Fevil.example",
    "/%5Cevil.example",
    "/ path with space",
    "/https:evil",
    "",
    null,
    undefined,
    42,
    "/" + "a".repeat(400),
  ]) {
    assert.equal(safeNext(bad), "/verify", String(bad));
  }
  assert.equal(safeNext("//x", "/feed"), "/feed");
});

test("the console sends signed-out staff to sign in and back; sign-in honours it", () => {
  const layout = fs.readFileSync("app/(staff)/staff/layout.tsx", "utf8");
  assert.match(layout, /redirect\(`\/login\?next=\$\{encodeURIComponent\(/);
  const actions = fs.readFileSync("app/(auth)/actions.ts", "utf8");
  assert.match(actions, /redirect\(safeNext\(formData\.get\("next"\)\)\)/);
  const login = fs.readFileSync("app/(auth)/login/page.tsx", "utf8");
  assert.match(login, /<input type="hidden" name="next" value=\{next\} \/>/);
});
