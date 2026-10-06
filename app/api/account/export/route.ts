import { NextResponse } from "next/server";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOwnGenotypeForExport } from "@/components/genotype/genotype-data";
import { PRIVACY_CONTACT } from "@/lib/privacy-content";

export const dynamic = "force-dynamic";

/**
 * "Download my data" — privacy policy section 10.
 *
 * Runs as the signed-in member, so row-level security decides what is
 * included — except replies, Gists, Gist answers and messages, which the
 * live-profile guard (0029) hides from a member who isn't live. Those are
 * read server-side, the member's own rows only, so the download is complete
 * whatever the member's status. The locked inbox holds: a member whose plan
 * can't read the inbox gets no bodies of messages sent to them — only their
 * own.
 *
 * Deliberately excluded, and said so in the file:
 *   - safety-screening events (the trust log) — readable by no member, by
 *     design; available on request, reviewed by a person;
 *   - other members' private data, including who reported you.
 */
export async function GET() {
  // Without credentials createClient() throws, which surfaced as a bare 500.
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Not available yet." }, { status: 503 });
  }
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

  // Replies, Gists, Gist answers and messages are hidden from a member whose
  // profile isn't live (0029) — but they're still that member's data, so the
  // export reads the member's OWN rows of those four server-side. Nothing
  // else changes: received message bodies are included only when the plan
  // can read the inbox, exactly as in the app.
  const admin = createAdminClient();
  const own = async (table: string, filter: string, select = "*") => {
    if (!admin) return { unavailable: true };
    const { data, error } = await admin.from(table).select(select).or(filter);
    return error ? { unavailable: true } : data;
  };

  const [
    profile, birthdate, history, promptAnswers, photos, repliesSent,
    gistSessions, gistOutcomes, couples, dateCommitments, coins, payments,
    entitlements, reportsFiled, blocks, emergencyContact, genotype,
    verification, helpMessages, helpTickets, consents,
  ] = await Promise.all([
    read("profiles", "id"),
    read("profile_birthdates", "profile_id"),
    read("profile_history", "profile_id"),
    read("prompt_answers", "profile_id"),
    read("profile_photos", "profile_id", "storage_path, position, face_match, created_at"),
    own("replies", `sender_id.eq.${me}`),
    own("gist_sessions", `proposer_id.eq.${me},invitee_id.eq.${me}`),
    own("gist_outcomes", `profile_id.eq.${me}`),
    readEither("couples", "member_a", "member_b"),
    readEither("date_commitments", "member_a", "member_b"),
    read("coin_ledger", "profile_id"),
    read("payments", "profile_id"),
    read("entitlements", "profile_id"),
    read("reports", "reporter_id", "reason, detail, status, created_at"),
    read("blocks", "blocker_id"),
    read("emergency_contacts", "profile_id", "label, phone_e164, confirmed_at, created_at"),
    getOwnGenotypeForExport(),
    read("verification_sessions", "profile_id", "product, status, result_code, passed, created_at, completed_at"),
    read("support_messages", "profile_id", "conversation_id, role, content, created_at"),
    read("support_tickets", "profile_id", "reference, category, summary, status, created_at"),
    read("consents", "profile_id", "kind, version, agreed_at"),
  ]);

  // Messages: the member's own, always; messages sent TO them only when their
  // plan can read the inbox (CLAUDE.md: a locked inbox is a bare count).
  let messages: unknown = { unavailable: true };
  if (admin) {
    const { data: threads } = await admin.from("threads").select("id").or(`member_a.eq.${me},member_b.eq.${me}`);
    const ids = (threads ?? []).map((t) => t.id as string);
    const { data: canRead } = await supabase.rpc("can_read_inbox", { p_profile_id: me });
    const { data, error } = ids.length
      ? await admin
          .from("messages")
          .select("id, thread_id, sender_id, body, created_at, read_at")
          .in("thread_id", ids)
          .or(canRead === true ? `sender_id.eq.${me},sender_id.neq.${me}` : `sender_id.eq.${me}`)
      : { data: [], error: null };
    messages = error ? { unavailable: true } : data;
  }

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
    verification_results: verification,
    verification_consents: consents,
    toastly_help_conversations: helpMessages,
    requests_passed_to_our_team: helpTickets,
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
