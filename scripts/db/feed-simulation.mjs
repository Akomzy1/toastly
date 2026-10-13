/**
 * A 30-day simulation of today's six (PRD §5.2.5; migration 0045) on a
 * throwaway local PostgreSQL 17 — no Supabase, nothing remote.
 *
 *   node scripts/db/feed-simulation.mjs [--members 2000] [--days 30] [--shards 4]
 *                                       [--men 0.6] [--set key=value ...]
 *
 * It seeds synthetic members, runs the real `_build_feed_for` for every member
 * who opens the app on each simulated day, applies a simple behaviour model to
 * whoever they are shown, and reports:
 *   - the fill rate (sixes with fewer than six),
 *   - how evenly impressions spread, split by gender,
 *   - how many members never appear in anyone's six.
 *
 * The behaviour model is an ASSUMPTION, not data — it exists to show how the
 * selection behaves under load, not to predict real usage. Change the numbers
 * below and rerun. `--set w_country=0.1` overrides a feed_config weight.
 *
 * What it can't show: real behaviour, real liquidity, Supabase's hosting, or
 * members living abroad (everyone here is in Nigeria).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { run, localCluster, pg } from "./lib.mjs";
import { SHIMS } from "../sql-test/harness.mjs";

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const MEMBERS = Number(opt("members", 2000));
const DAYS = Number(opt("days", 30));
const SHARDS = Number(opt("shards", 4));
const MEN = Number(opt("men", 0.6));
const OVERRIDES = args.flatMap((a, i) => (args[i - 1] === "--set" ? [a.split("=")] : []));

// --- The behaviour model (assumptions) ----------------------------------------
const MODEL = {
  // How often a member opens the app on a given day.
  open: [{ share: 0.25, p: 0.9 }, { share: 0.45, p: 0.5 }, { share: 0.3, p: 0.15 }],
  replyPerShown: 0.04, // sends a reply / Gist invite to someone shown
  passPerShown: 0.15, // taps "not for me"
  // The rest of the sixes are read and ignored.
  lateJoinersShare: 0.25, // join evenly across the 30 days instead of being there on day 0
  customRangeShare: 0.35, // set their own age range
  premiumShare: 0.12, // on a paid plan (must make no difference to anyone's score)
};

const MIG = path.resolve("supabase/migrations");
const migrations = fs.readdirSync(MIG).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();

const SEED = `
create table sim_members (
  id uuid primary key, gender text not null, p_open real not null, join_day int not null, age int not null
);

-- Auth users: the signup trigger creates each profile and its birthdate.
with n as (
  select g,
         (random() < ${MEN}) as is_man,
         greatest(20, least(45, round(27 + 4 * (random() + random() + random() - 1.5) * 1.4)::int)) as base_age
  from generate_series(1, ${MEMBERS}) g
), m as (
  select g, is_man, case when is_man then base_age + 2 else base_age end as age,
         gen_random_uuid() as id,
         case when random() < ${MODEL.lateJoinersShare} then 1 + floor(random() * (${DAYS} - 1))::int else 0 end as join_day,
         random() as r_open
  from n
)
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at)
select id, 'sim' || g || '@example.com',
       jsonb_build_object('display_name', 'Member ' || g, 'gender', case when is_man then 'man' else 'woman' end,
                          'date_of_birth', (current_date - (age * 365 + 120))::text),
       now()
from m;

insert into sim_members (id, gender, p_open, join_day, age)
select p.id, p.gender,
       case when r < ${MODEL.open[0].share} then ${MODEL.open[0].p}
            when r < ${MODEL.open[0].share + MODEL.open[1].share} then ${MODEL.open[1].p} else ${MODEL.open[2].p} end,
       case when random() < ${MODEL.lateJoinersShare} then 1 + floor(random() * (${DAYS} - 1))::int else 0 end,
       extract(year from age(current_date, b.date_of_birth))::int
from profiles p join profile_birthdates b on b.profile_id = p.id, lateral (select random() as r) rr;

-- Profile details.
update profiles p set
  city = (array['Lagos','Lagos','Lagos','Lagos','Lagos','Lagos','Abuja','Abuja','Port Harcourt','Ibadan','Enugu','Benin City'])[1 + floor(random() * 12)::int],
  intent = (array[null,null,'casual','casual','open_to_serious','open_to_serious','open_to_serious','serious','serious','serious','marriage_minded','marriage_minded'])[1 + floor(random() * 12)::int]::intent_level
from sim_members s where s.id = p.id;

update profiles p set age_min = greatest(18, s.age - 3 - floor(random() * 3)::int), age_max = least(70, s.age + 3 + floor(random() * 6)::int)
from sim_members s where s.id = p.id and random() < ${MODEL.customRangeShare};

-- Prompt answers: 1 to 4 each.
insert into prompt_answers (profile_id, prompt_id, answer)
select s.id, pr.id, 'sim'
from sim_members s
join lateral (select id from prompts order by random() limit (1 + floor(random() * 4))::int) pr on true;

-- Live: phone, Verified Real, four photos with a matched main photo.
insert into phone_identities (phone_hash, profile_id)
select md5(id::text) || md5(id::text || 'phone'), id from sim_members;
update profiles set phone_verified_at = now(), stage = 'verified_real' where id in (select id from sim_members);
insert into profile_photos (profile_id, storage_path, position)
select s.id, s.id || '/p' || i || '.jpg', i from sim_members s, generate_series(0, 3) i;
update profiles p set pending_main_photo_id = (select ph.id from profile_photos ph where ph.profile_id = p.id order by position limit 1)
where p.id in (select id from sim_members);
do $$ declare r record; begin
  for r in select pending_main_photo_id as ph from profiles where pending_main_photo_id is not null loop
    perform record_main_photo_match(r.ph, 'matched');
  end loop;
end $$;

-- Some members are on a paid plan. It must change nothing about anyone's score.
insert into entitlements (profile_id, tier, source, ends_at)
select id, 'premium', 'subscription', now() + interval '400 days' from sim_members where random() < ${MODEL.premiumShare};

-- Members who join later start paused and are let in on their day.
update profiles set paused = true where id in (select id from sim_members where join_day > 0);
delete from member_presence;
`;

const PROCEDURE = `
create or replace procedure sim_day(p_day int, p_shard int, p_shards int)
language plpgsql as $$
declare
  v_start timestamptz := date_trunc('day', now()) + make_interval(days => p_day);
  r record; c record; v_ans uuid; n int;
begin
  for r in
    select s.id, s.gender, s.join_day from sim_members s
     where s.join_day <= p_day
       and abs(hashtext(s.id::text)) % p_shards = p_shard
       and (s.join_day = p_day or random() < s.p_open)
     order by random()
  loop
    if r.join_day = p_day then
      update profiles set paused = false, first_live_at = v_start where id = r.id;
    end if;
    insert into member_presence (profile_id, seen_at) values (r.id, v_start + interval '8 hours' + random() * interval '12 hours')
      on conflict (profile_id) do update set seen_at = excluded.seen_at;
    for c in select candidate_id from _build_feed_for(r.id, v_start + interval '9 hours') loop
      if random() < ${MODEL.replyPerShown} then
        select id into v_ans from prompt_answers where profile_id = c.candidate_id limit 1;
        insert into replies (sender_id, recipient_id, prompt_answer_id, kind) values (r.id, c.candidate_id, v_ans, 'gist_invite')
          on conflict do nothing;
      elsif random() < ${MODEL.passPerShown} / (1 - ${MODEL.replyPerShown}) then
        insert into feed_passes (profile_id, candidate_id) values (r.id, c.candidate_id) on conflict do nothing;
      end if;
    end loop;
    commit;
  end loop;
end $$;
`;

const REPORT = `
with builds as (
  select f.profile_id, f.feed_date, count(*) as n from daily_feed f group by 1, 2
), opened as (
  select s.id, s.gender, st.feed_date, coalesce(b.n, 0) as n
  from feed_state st join sim_members s on s.id = st.profile_id
  left join builds b on b.profile_id = st.profile_id and b.feed_date = st.feed_date
)
select 'fill' as section, gender,
       count(*) as builds,
       count(*) filter (where n < 6) as short,
       round(100.0 * count(*) filter (where n < 6) / count(*), 1) as pct_short,
       count(*) filter (where n = 0) as empty,
       round(avg(n), 2) as avg_size
from opened group by gender
union all
select 'fill', 'all', count(*), count(*) filter (where n < 6), round(100.0 * count(*) filter (where n < 6) / count(*), 1),
       count(*) filter (where n = 0), round(avg(n), 2) from opened;
`;

const REPORT_EXPOSURE = `
with imp as (
  select s.id, s.gender, s.join_day,
         (select count(*) from daily_feed f where f.candidate_id = s.id) as impressions,
         ${DAYS} - s.join_day as days_live
  from sim_members s
), ranked as (
  select *, impressions::float8 / greatest(days_live, 1) as per_day,
         row_number() over (partition by gender order by impressions) as rk,
         count(*) over (partition by gender) as cnt,
         sum(impressions) over (partition by gender) as tot
  from imp
)
select gender,
       count(*) as members,
       round(avg(impressions), 1) as mean_impr,
       percentile_cont(0.1) within group (order by impressions) as p10,
       percentile_cont(0.5) within group (order by impressions) as median,
       percentile_cont(0.9) within group (order by impressions) as p90,
       max(impressions) as max_impr,
       round(avg(per_day)::numeric, 2) as mean_per_live_day,
       round((1 - 2 * sum((cnt - rk + 0.5) * impressions) / nullif(max(cnt) * max(tot), 0))::numeric, 3) as gini,
       round((100.0 * sum(impressions) filter (where rk > cnt * 0.9) / nullif(max(tot), 0))::numeric, 1) as top10_share_pct,
       count(*) filter (where impressions = 0) as never_appear,
       count(*) filter (where impressions = 0 and days_live >= 7) as never_appear_live_7d
from ranked group by gender
union all
select 'all', count(*), round(avg(impressions), 1), percentile_cont(0.1) within group (order by impressions),
       percentile_cont(0.5) within group (order by impressions), percentile_cont(0.9) within group (order by impressions),
       max(impressions), round(avg(per_day)::numeric, 2), null, null,
       count(*) filter (where impressions = 0), count(*) filter (where impressions = 0 and days_live >= 7)
from ranked;
`;

function psql(url, sql, { capture = false } = {}) {
  const r = run("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", ...(capture ? ["-A", "-F", "\t"] : []), "-d", url], { input: sql });
  return r.stdout;
}
function psqlAsync(url, sql) {
  return new Promise((resolve, reject) => {
    const p = spawn(pg("psql"), ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", url, "-c", sql], { env: { ...process.env, PGCLIENTENCODING: "UTF8" } });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`psql exited ${code}: ${err.slice(0, 800)}`))));
  });
}
function table(tsv) {
  const rows = tsv.trim().split("\n").map((l) => l.split("\t"));
  const w = rows[0].map((_, i) => Math.max(...rows.map((r) => String(r[i] ?? "").length)));
  return rows.map((r) => r.map((c, i) => String(c ?? "").padEnd(w[i])).join("  ")).join("\n");
}

const cluster = localCluster(55433);
const t0 = Date.now();
try {
  cluster.createDb("sim");
  const url = cluster.url("sim");
  psql(url, SHIMS);
  for (const f of migrations) run("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", url, "-f", path.join(MIG, f)]);
  for (const [k, v] of OVERRIDES) psql(url, `update feed_config set value = ${Number(v)} where key = '${k}'`);

  console.log(`seeding ${MEMBERS} members (${Math.round(MEN * 100)}% men) ...`);
  psql(url, SEED);
  psql(url, PROCEDURE);
  psql(url, "analyze");
  if (args.includes("--profile")) {
    // Time the pieces of one selection, for tuning the function itself.
    const probe = psql(url, `
      \\timing on
      insert into member_presence select id, now() from sim_members on conflict do nothing;
      update profiles set paused = false;
      analyze;
      select count(*) from profiles;
      select count(*) from profiles p, (select id from sim_members limit 1) v where can_meet(v.id, p.id) and can_meet(p.id, v.id);
      select count(*) from profiles p where profile_is_live(p.id);
      select count(*) from profiles p where _intent_rank(p.intent) is not null;
      select count(*) from profiles p left join profile_birthdates b on b.profile_id = p.id where _age_in_window(30, null, null, 30, 18, 70, 4, 5, 9);
      select count(*) from profiles p where (select count(*) from prompt_answers pa where pa.profile_id = p.id) > 0;
      select count(*) from profiles p where (select count(*) from daily_feed f where f.candidate_id = p.id and f.feed_date = current_date) >= 0;
      select count(*) from (select candidate_id from _feed_pick((select id from sim_members where gender = 'man' limit 1), now(), 6)) x;
      select count(*) from (select candidate_id from _feed_pick((select id from sim_members where gender = 'woman' limit 1), now(), 6)) x;
    `, { capture: true });
    console.log(probe);
    psql(url, `
      load 'auto_explain';
      set auto_explain.log_min_duration = 0;
      set auto_explain.log_analyze = on;
      set auto_explain.log_nested_statements = on;
      set auto_explain.log_buffers = off;
      select count(*) from _feed_pick((select id from sim_members where gender = 'woman' limit 1), now(), 6);
    `);
    const log = fs.readFileSync(path.join(cluster.dir, "log.txt"), "utf8");
    fs.writeFileSync(path.join(os.tmpdir(), "feed-plan.txt"), log);
    console.log("plan written to " + path.join(os.tmpdir(), "feed-plan.txt"));
    throw new Error("profile only");
  }
  console.log(`seeded in ${Math.round((Date.now() - t0) / 1000)}s; running ${DAYS} days on ${SHARDS} connections ...`);

  for (let d = 0; d < DAYS; d++) {
    const td = Date.now();
    await Promise.all(Array.from({ length: SHARDS }, (_, s) => psqlAsync(url, `call sim_day(${d}, ${s}, ${SHARDS})`)));
    const done = psql(url, "select count(*) from feed_state", { capture: true }).trim().split("\n")[1];
    console.log(`  day ${String(d + 1).padStart(2)}: ${Math.round((Date.now() - td) / 1000)}s (${done} sixes built so far)`);
  }

  const composition = psql(url, "select gender, count(*) as members, count(*) filter (where join_day > 0) as joined_later, round(avg(age), 1) as mean_age from sim_members group by gender order by gender", { capture: true });
  console.log("\nMembers\n" + table(composition));
  console.log("\nFill (every six that was built; short = fewer than six)\n" + table(psql(url, REPORT, { capture: true })));
  console.log("\nImpressions over the run, per member (a member's appearance in someone's six)\n" + table(psql(url, REPORT_EXPOSURE, { capture: true })));
  const paid = psql(url, `
    select case when e.profile_id is null then 'starter' else 'premium' end as plan,
           round(avg((select count(*) from daily_feed f where f.candidate_id = s.id)), 1) as mean_impressions
    from sim_members s left join entitlements e on e.profile_id = s.id and e.tier = 'premium'
    group by 1 order by 1`, { capture: true });
  console.log("\nBy plan (should be the same: plan is not a score input)\n" + table(paid));
  console.log(`\nweights: ${psql(url, "select string_agg(key || '=' || value, ', ' order by key) from feed_config", { capture: true }).trim().split("\n").pop()}`);
  console.log(`total ${Math.round((Date.now() - t0) / 1000)}s`);
} catch (e) {
  if (e.message !== "profile only") throw e;
} finally {
  cluster.stop();
  void os;
}
