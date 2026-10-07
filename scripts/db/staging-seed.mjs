/**
 * Test members for the STAGING rehearsal of the release-1 cutover
 * (GO-LIVE §0g). Refuses to run against anything but the staging project.
 *
 *   node scripts/db/staging-seed.mjs --before
 *       production's state (migrations through 0026): four testers with
 *       answers, one of them staff, a Gist invite between two, a report.
 *       Passwords go to backups/staging-testers.json (git-ignored).
 *   node scripts/db/staging-seed.mjs --after
 *       after 0029 … 0034: makes the testers live the way the server would
 *       record it — four photos each (uploaded, metadata-free), main photo
 *       matched — since 0029 resets Verified Real reached without the
 *       in-page selfie, and a live profile needs four photos.
 *
 * Uses the service key from .env.staging.local, as the server does.
 */
import fs from "node:fs";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { readEnv } from "./lib.mjs";

const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");
const sharp = require("sharp");

const mode = process.argv.includes("--after") ? "after" : process.argv.includes("--before") ? "before" : null;
if (!mode) {
  console.error("Usage: node scripts/db/staging-seed.mjs --before | --after");
  process.exit(2);
}

const staging = readEnv(".env.staging.local");
const production = fs.existsSync(".env.local") ? readEnv(".env.local") : {};
const ref = (u) => { try { return new URL(u).host.split(".")[0]; } catch { return ""; } };
const target = ref(staging.NEXT_PUBLIC_SUPABASE_URL);
if (!target || !staging.SUPABASE_SERVICE_ROLE_KEY) {
  console.error(".env.staging.local has no staging URL or service key yet.");
  process.exit(1);
}
if (target === ref(production.NEXT_PUBLIC_SUPABASE_URL) || target === "levxucumutuatoskhhfr") {
  console.error("Refusing: that is the production project.");
  process.exit(1);
}
if (staging.SUPABASE_PROJECT_REF && staging.SUPABASE_PROJECT_REF !== target) {
  console.error("Refusing: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_PROJECT_REF in .env.staging.local disagree.");
  process.exit(1);
}

const db = createClient(staging.NEXT_PUBLIC_SUPABASE_URL, staging.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const must = async (p, what) => {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};
const TESTERS = [
  { key: "owner", name: "Rehearsal Owner", gender: "woman", dob: "1994-03-01", city: "Lagos", staff: true },
  { key: "amaka", name: "Amaka Rehearsal", gender: "woman", dob: "1996-05-10", city: "Lagos" },
  { key: "tobi", name: "Tobi Rehearsal", gender: "man", dob: "1993-11-20", city: "Lagos" },
  { key: "kelechi", name: "Kelechi Rehearsal", gender: "man", dob: "1995-07-07", city: "Lagos" },
];
const FILE = "backups/staging-testers.json";

if (mode === "before") {
  fs.mkdirSync("backups", { recursive: true });
  const out = {};
  for (const t of TESTERS) {
    const email = `rehearsal+${t.key}@trytoastly.com`;
    const password = crypto.randomBytes(12).toString("base64url");
    const user = await must(db.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { display_name: t.name, gender: t.gender, date_of_birth: t.dob },
    }), `create ${t.key}`);
    const id = user.user.id;
    await must(db.from("profiles").update({ stage: "verified_real", phone_verified_at: new Date().toISOString(), city: t.city, intent: "serious" }).eq("id", id), `profile ${t.key}`);
    await must(db.from("prompt_answers").insert([
      { profile_id: id, prompt_id: 1, answer: "Church, then jollof at my aunty's" },
      { profile_id: id, prompt_id: 7, answer: "Remember the small thing I mentioned" },
    ]), `answers ${t.key}`);
    if (t.staff) await must(db.from("staff_members").insert({ profile_id: id }), "staff");
    out[t.key] = { id, email, password };
  }
  await must(db.from("gist_sessions").insert({ proposer_id: out.tobi.id, invitee_id: out.amaka.id }), "gist invite");
  await must(db.from("reports").insert({ reporter_id: out.kelechi.id, reported_id: out.tobi.id, reason: "harassment", detail: "rehearsal" }), "report");
  fs.writeFileSync(FILE, JSON.stringify(out, null, 2));
  console.log(`seeded ${TESTERS.length} testers on staging (${target}); sign-ins in ${FILE}`);
} else {
  const testers = JSON.parse(fs.readFileSync(FILE, "utf8"));
  const art = fs.readdirSync("public/img/safety").filter((f) => /\.(webp|jpe?g|png)$/.test(f)).map((f) => `public/img/safety/${f}`);
  for (const [key, t] of Object.entries(testers)) {
    const ids = [];
    for (let i = 0; i < 4; i++) {
      // Re-encoded to a fresh JPEG: no metadata, as the server's upload path does.
      const jpeg = await sharp(art[i % art.length]).resize(800, 1000, { fit: "cover" }).jpeg({ quality: 80 }).toBuffer();
      const path = `${t.id}/rehearsal-${i}.jpg`;
      await must(db.storage.from("profile-photos").upload(path, jpeg, { contentType: "image/jpeg", upsert: true }), `upload ${key} ${i}`);
      const row = await must(db.from("profile_photos").insert({ profile_id: t.id, storage_path: path, position: i }).select("id").single(), `photo ${key} ${i}`);
      ids.push(row.id);
    }
    await must(db.from("profiles").update({ stage: "verified_real", phone_verified_at: new Date().toISOString(), pending_main_photo_id: ids[0] }).eq("id", t.id), `main ${key}`);
    await must(db.rpc("record_main_photo_match", { p_photo_id: ids[0], p_outcome: "matched", p_reason: null }), `match ${key}`);
    const { data: live } = await db.rpc("profile_is_live", { p_profile_id: t.id });
    console.log(`${key}: live ${live === true}`);
  }
}
