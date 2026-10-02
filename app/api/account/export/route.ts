import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOwnGenotypeForExport } from "@/components/genotype/genotype-data";
import { PRIVACY_CONTACT } from "@/lib/privacy-content";

export const dynamic = "force-dynamic";

/**
 * "Download my data" — privacy policy section 10.
 *
 * Runs as the signed-in member, so row-level security decides what is
 * included: a member gets their own rows and nothing they couldn't already
 * see. That matters for the locked inbox — a Starter member's export
 * contains no message bodies or senders, because RLS returns none.
 *
 * Deliberately excluded, and said so in the file:
 *   - safety-screening events (the trust log) — readable by no member, by
 *     design; available on request, reviewed by a person;
 *   - other members' private data, including who reported you.
 */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in to download your data." }, { status: 401 });
  }

  const me = user.id;
  const read = async (table: string, column: string, select = "*") => {
    const { data, error } = await supabase.from(table).select(select).eq(column, me);
    return error ? { unavailable: true } : data;
  };
  const readEither = async (table: string, a: string, b: string) => {
    const { data, error } = await supabase.from(table).select("*").or(`${a}.eq.${me},${b}.eq.${me}`);
    return error ? { unavailable: true } : data;
  };

  const [
    profile, birthdate, history, promptAnswers, photos, repliesSent,
    gistSessions, gistOutcomes, couples, dateCommitments, coins, payments,
    entitlements, reportsFiled, blocks, emergencyContact, genotype,
  ] = await Promise.all([
    read("profiles", "id"),
    read("profile_birthdates", "profile_id"),
    read("profile_history", "profile_id"),
    read("prompt_answers", "profile_id"),
    read("profile_photos", "profile_id", "storage_path, position, created_at"),
    read("replies", "sender_id"),
    readEither("gist_sessions", "proposer_id", "invitee_id"),
    read("gist_outcomes", "profile_id"),
    readEither("couples", "member_a", "member_b"),
    readEither("date_commitments", "member_a", "member_b"),
    read("coin_ledger", "profile_id"),
    read("payments", "profile_id"),
    read("entitlements", "profile_id"),
    read("reports", "reporter_id", "reason, detail, status, created_at"),
    read("blocks", "blocker_id"),
    read("emergency_contacts", "profile_id", "label, phone_e164, confirmed_at, created_at"),
    getOwnGenotypeForExport(),
  ]);

  const messagesRes = await supabase
    .from("messages")
    .select("id, thread_id, sender_id, body, created_at, read_at");
  const messages = messagesRes.error ? { unavailable: true } : messagesRes.data;

  const body = {
    exported_at: new Date().toISOString(),
    notes: [
      "This file contains the personal data Toastly holds about you that your account can access.",
      "Messages: if your plan doesn't include reading your inbox, messages sent to you are not included, because they are locked to you in the app too.",
      `Safety screening records are not included. You can ask for them by emailing ${PRIVACY_CONTACT}; a person reviews every request.`,
      "Other members' private information, including who has reported you, is not included.",
    ],
    account: {
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
      created_at: user.created_at,
    },
    profile,
    date_of_birth: birthdate,
    relationship_history: history,
    prompt_answers: promptAnswers,
    photos,
    replies_sent: repliesSent,
    messages,
    gist_sessions: gistSessions,
    gist_answers: gistOutcomes,
    couple_mode: couples,
    date_commitments: dateCommitments,
    coins,
    payments,
    plan: entitlements,
    reports_you_made: reportsFiled,
    people_you_blocked: blocks,
    emergency_contact: emergencyContact,
    genotype,
  };

  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="toastly-data-${day}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
