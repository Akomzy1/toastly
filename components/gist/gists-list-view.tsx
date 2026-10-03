import Link from "next/link";
import { AnswerStrip, Monogram } from "./invite-parts";
import { ScreenBand } from "@/components/app/screen-band";

/** The list body of gists-list.slim.html — shared by the page and the audit harness. */

export type GistRow = {
  id: string;
  name: string;
  status: string;
  teal: boolean;
  invite: boolean;
  whose: string;
  prompt: string | null;
  answer: string | null;
};

export type GistGroup = { title: string; rows: GistRow[]; empty: string };

export function GistListView({ groups }: { groups: GistGroup[] }) {
  return (
    <div className="mx-auto grid w-full max-w-[680px]">
      <ScreenBand title="Gists" sub="18-minute voice chats" />
      <div className="grid content-start gap-6 px-3.5 pb-6 pt-4">
        {groups.map((g) => (
          <section key={g.title} className="grid gap-2.5">
            <div className="flex items-baseline justify-between gap-2.5 px-0.5">
              <h2 className="m-0 font-sans text-chip font-semibold uppercase tracking-[0.12em] text-grey-600">{g.title}</h2>
              <p className="m-0 text-[12.5px] text-grey-400">{g.rows.length || ""}</p>
            </div>
            {g.rows.map((r) => (
              <Link
                key={r.id}
                href={`/gist/${r.id}`}
                className={`grid gap-2.5 rounded-[14px] border bg-white p-3 text-inherit no-underline hover:border-green-500 ${
                  r.invite ? "border-champagne" : "border-ink-900/10"
                }`}
              >
                <span className="flex items-center gap-3">
                  <Monogram name={r.name} size={48} />
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="text-ui font-semibold text-ink-900">{r.name}</span>
                    <span className={`text-[13px] leading-[1.45] ${r.teal ? "text-green-500" : "text-grey-600"}`}>{r.status}</span>
                  </span>
                  <span aria-hidden="true" className="text-[16px] text-grey-400">›</span>
                </span>
                {r.prompt && r.answer ? <AnswerStrip whose={r.whose} prompt={r.prompt} answer={r.answer} /> : null}
              </Link>
            ))}
            {g.rows.length === 0 ? (
              <p className="m-0 rounded-[14px] border border-ink-900/10 bg-white p-3.5 text-nav leading-[1.55] text-grey-600">{g.empty}</p>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}
