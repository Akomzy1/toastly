import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LockedRow } from "./locked-row";
import {
  canReadInbox,
  lockedLabel,
  type Inbox,
} from "@/lib/inbox";
import type { Tier } from "@/lib/types/profile";

export const metadata: Metadata = {
  title: "Inbox",
  robots: { index: false, follow: false },
};

/**
 * Inbox.
 *
 * The branch below is the whole feature. On Starter, the server fetches a
 * COUNT and nothing else — it never queries messages, so there is no sender
 * id or body anywhere in this render, in the RSC payload, or in any response
 * the client could inspect. Row-level security would refuse the rows anyway;
 * not asking for them is the second lock.
 */
export default async function InboxPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tierRow } = await supabase.rpc("current_tier", {
    p_profile_id: user.id,
  });
  const tier = (tierRow as Tier | null) ?? "starter";

  let inbox: Inbox;

  if (!canReadInbox(tier)) {
    const { data: count } = await supabase.rpc("unread_count");
    inbox = { kind: "locked", unreadCount: (count as number | null) ?? 0 };
  } else {
    const { data: threads } = await supabase
      .from("threads")
      .select("id, member_a, member_b, messages(id, body, created_at, sender_id, read_at)")
      .order("created_at", { ascending: false });

    inbox = {
      kind: "open",
      threads: (threads ?? []).map((t) => {
        const msgs = (t.messages ?? []) as {
          id: string;
          body: string;
          created_at: string;
          sender_id: string;
          read_at: string | null;
        }[];
        const last = msgs[msgs.length - 1];
        return {
          id: t.id,
          otherMemberName: "Your match",
          lastMessage: last?.body ?? "",
          lastAt: last?.created_at ?? "",
          unread: msgs.filter((m) => !m.read_at && m.sender_id !== user.id).length,
        };
      }),
    };
  }

  return (
    <div className="mx-auto grid max-w-[560px] gap-6 px-5 py-section-y">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-h3 text-ink-900">Inbox</h1>
        {inbox.kind === "locked" && inbox.unreadCount > 0 ? (
          /* The tab-bar badge: amber pill, count only, no preview. */
          <span className="grid h-5 min-w-5 place-items-center rounded-pill bg-gold-500 px-1.5 text-chip font-semibold text-green-800">
            {inbox.unreadCount}
          </span>
        ) : null}
      </div>

      {inbox.kind === "locked" ? (
        inbox.unreadCount === 0 ? (
          <Card className="grid gap-3 p-[26px]">
            <h2 className="text-h5 text-ink-900">Nothing waiting</h2>
            <p className="text-ui text-grey-600">
              When somebody messages you, you&rsquo;ll see it here. On the free
              plan you&rsquo;ll see that it arrived — reading it is part of
              Premium.
            </p>
          </Card>
        ) : (
          /* A bare count, and a row carrying no sender, no initial, no
             snippet. There is nothing to reconstruct an identity from. */
          <LockedRow label={lockedLabel(inbox.unreadCount)} />
        )
      ) : !inbox.threads.length ? (
        <Card className="grid gap-3 p-[26px]">
          <h2 className="text-h5 text-ink-900">No messages yet</h2>
          <p className="text-ui text-grey-600">
            Reply to something on today&rsquo;s feed to start a conversation.
          </p>
          <Button variant="outline" asChild className="justify-self-start">
            <Link href="/feed">Today&rsquo;s matches</Link>
          </Button>
        </Card>
      ) : (
        <ul className="grid list-none gap-3 p-0">
          {inbox.threads.map((t) => (
            <li key={t.id}>
              <Card interactive className="grid gap-2 p-[22px]">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-ui font-semibold text-ink-900">
                    {t.otherMemberName}
                  </span>
                  {t.unread > 0 ? (
                    <Badge variant="tier">{t.unread}</Badge>
                  ) : null}
                </div>
                <p className="line-clamp-2 text-ui text-grey-600">
                  {t.lastMessage}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
