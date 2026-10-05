import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { LiveStatus } from "@/lib/live-profile";
import { AppBand, AppColumn, LinkList } from "@/components/app/app-band";
import { StandingNotice } from "@/components/app/standing-notice";
import { cn } from "@/lib/utils";

/**
 * Shown in place of a feed, Gist, inbox or date screen when the member's own
 * profile isn't live (PRD §5.1.2). Built against the "Going live" prototypes:
 *
 *   profile-not-live.slim.html       never live yet — what's left, in order
 *   profile-access-paused.slim.html  was live, dropped below the bar
 *
 * Both keep "Still open to you" one tap away: settings, Your data and the
 * safety kit, and — while paused — Couple Mode, which stays open for profile
 * reasons (decided 2026-10-05).
 *
 * Deviation: the prototypes also list Toastly Help, which isn't built
 * (Prompt 15), so the row is left out rather than linking nowhere.
 */
export async function ProfileNotLive({ status }: { status: LiveStatus }) {
  // A person's review decision comes first: it's the reason, not the photos.
  if (status.standing !== "good") return <StandingNotice status={status} />;
  const paused = status.wasLive && status.phoneConfirmed && status.verifiedReal;
  return paused ? <AccessPaused status={status} /> : <NotLiveYet status={status} />;
}

const STILL_OPEN = [
  { href: "/profile", label: "Settings" },
  { href: "/account", label: "Your data", sub: "See, download or delete what we hold" },
];
const SAFETY = { href: "/safety-kit", label: "Safety kit", sub: "Free on every plan, always" };

function NotLiveYet({ status }: { status: LiveStatus }) {
  const photosDone = status.photoCount >= status.minPhotos && status.mainPhoto !== "missing";
  const selfieDone = status.verifiedReal && status.mainPhoto === "matched";
  const photosAdded = Math.min(status.photoCount + (status.mainPhoto === "checking" ? 1 : 0), status.minPhotos);

  type Step = { n: number; label: string; sub: string; href: string; kind: "done" | "ring" | "current" | "todo"; dash?: string };
  const steps: Step[] = [
    {
      n: 1,
      label: "Phone",
      sub: status.phoneConfirmed ? "Confirmed" : "Confirm your number",
      href: "/verify",
      kind: status.phoneConfirmed ? "done" : "current",
    },
    {
      n: 2,
      label: "Photos",
      sub: photosDone
        ? `${status.minPhotos} of ${status.minPhotos} added`
        : `${photosAdded} of ${status.minPhotos} added · add ${status.minPhotos - photosAdded === 1 ? "one more" : `${status.minPhotos - photosAdded} more`}`,
      href: "/photos",
      kind: photosDone ? "done" : !status.phoneConfirmed ? "todo" : photosAdded > 0 ? "ring" : "current",
      dash: `${Math.round((photosAdded / status.minPhotos) * 60)} 60`,
    },
    {
      n: 3,
      label: "Selfie check",
      sub: status.mainPhoto === "checking" ? "Being checked" : "Confirms you're real, and that your main photo is you",
      href: "/verify",
      kind: selfieDone ? "done" : status.mainPhoto === "checking" ? "ring" : photosDone && status.phoneConfirmed ? "current" : "todo",
      dash: "24 60",
    },
  ];

  return (
    <>
      <AppBand title="Your profile" sub="Almost ready" safety />
      <AppColumn>
        <div className="grid gap-2.5 px-0.5">
          <h2 className="font-serif text-[24px] font-bold leading-[1.22] text-ink-900">
            Almost there — finish your profile to start meeting people.
          </h2>
          <p className="text-ui leading-[1.6] text-ink-800">You&rsquo;ll see your six as soon as people can see you too.</p>
        </div>

        <div className="grid gap-2.5">
          <p className="mx-0.5 text-chip font-semibold uppercase tracking-[0.12em] text-green-500">What&rsquo;s left</p>
          <ol className="grid list-none overflow-hidden rounded-xl border border-ink-900/[.12] bg-white p-0">
            {steps.map((s, i) => {
              const current = s.kind === "ring" || s.kind === "current";
              return (
                <li key={s.n} className={i ? "border-t border-ink-900/10" : ""}>
                  <Link
                    href={s.href}
                    aria-current={current ? "step" : undefined}
                    aria-label={`Step ${s.n}, ${s.label}. ${s.kind === "done" ? "Done" : current ? "Next" : "To do"}. ${s.sub}`}
                    className="flex min-h-[68px] items-center gap-3 px-[15px] py-3 no-underline transition-colors hover:bg-paper"
                  >
                    <span aria-hidden="true" className="grid h-10 w-10 flex-shrink-0 place-items-center">
                      {s.kind === "done" ? (
                        <span className="grid h-10 w-10 place-items-center rounded-pill bg-green-50">
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                            <path d="M5 13l4 4 10-11" stroke="#00695C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                      ) : s.kind === "ring" ? (
                        <svg width="40" height="40" viewBox="12 12 24 24" fill="none">
                          <circle cx="24" cy="24" r="9.5" strokeWidth="3" className="stroke-gold-100" />
                          <circle cx="24" cy="24" r="9.5" strokeWidth="3" strokeDasharray={s.dash} strokeLinecap="round" transform="rotate(-90 24 24)" className="stroke-gold-600" />
                        </svg>
                      ) : (
                        <span
                          className={cn(
                            "grid h-10 w-10 place-items-center rounded-pill border-[1.5px] text-ui font-semibold",
                            current ? "border-gold-600 bg-gold-50 text-gold-800" : "border-grey-200 bg-white text-grey-600",
                          )}
                        >
                          {s.n}
                        </span>
                      )}
                    </span>
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="text-ui font-semibold text-ink-900">{s.label}</span>
                      <span className="text-[13px] leading-[1.45] text-grey-600">{s.sub}</span>
                    </span>
                    <span aria-hidden="true" className="flex-shrink-0 text-[16px] text-grey-400">
                      ›
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>

        <LinkList heading="Still open to you" items={[...STILL_OPEN, SAFETY]} />
      </AppColumn>
    </>
  );
}

async function AccessPaused({ status }: { status: LiveStatus }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The member's own photos, as the prototype shows them: main first, then
  // the others, in four tiles. Their own files are always theirs to see.
  const [{ data: me }, { data: rows }, { data: couple }] = await Promise.all([
    supabase.from("profiles").select("main_photo_id").eq("id", user?.id ?? "").single(),
    supabase
      .from("profile_photos")
      .select("id, storage_path, face_match")
      .eq("profile_id", user?.id ?? "")
      .neq("face_match", "mismatch")
      .order("position")
      .order("created_at"),
    supabase.from("couples").select("id").eq("status", "active").maybeSingle(),
  ]);

  const photos = rows ?? [];
  const main = photos.find((p) => p.id === me?.main_photo_id) ?? null;
  const others = photos.filter((p) => p.id !== main?.id && p.face_match !== "pending" && p.face_match !== "review");
  const tiles = [main, ...others].slice(0, 4);
  while (tiles.length < 4) tiles.push(null);

  const paths = tiles.flatMap((t) => (t ? [t.storage_path] : []));
  const { data: signed } = paths.length
    ? await supabase.storage.from("profile-photos").createSignedUrls(paths, 60 * 30)
    : { data: [] };
  const urlOf = (path: string) => signed?.find((s) => s.path === path)?.signedUrl ?? "";

  const filled = tiles.filter(Boolean).length;
  const checking = status.mainPhoto === "checking";
  const counterNote = checking
    ? "Your new main photo is being checked"
    : !main
      ? "Add a main photo of you"
      : filled < status.minPhotos
        ? `Add ${status.minPhotos - filled === 1 ? "one more photo" : `${status.minPhotos - filled} more photos`}`
        : "";

  const links = [
    ...STILL_OPEN,
    ...(couple ? [{ href: "/couple", label: "Couple Mode", sub: "Free on every plan" }] : []),
    SAFETY,
  ];

  return (
    <>
      <AppBand title="Your profile" sub="Hidden for now" safety />
      <AppColumn>
        <div className="grid gap-2.5 px-0.5">
          <h2 className="font-serif text-[24px] font-bold leading-[1.22] text-ink-900">Your profile is hidden for now.</h2>
          <p className="text-ui leading-[1.6] text-ink-800">You need four photos, including a main photo of you.</p>
        </div>

        <div className="grid gap-3.5 rounded-xl border border-ink-900/[.12] bg-white p-3.5">
          <ul className="grid list-none grid-cols-4 gap-2 p-0">
            {tiles.map((t, i) => (
              <li key={t?.id ?? `empty-${i}`} className="min-w-0">
                {t ? (
                  <div className="relative aspect-[4/5] w-full overflow-hidden rounded-md bg-grey-200">
                    {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from a private bucket */}
                    <img src={urlOf(t.storage_path)} alt={i === 0 ? "Your main photo" : `Photo ${i + 1}`} className="block h-full w-full object-cover" />
                    <span className="absolute left-[5px] top-[5px] grid h-5 min-w-5 place-items-center rounded-pill bg-green-800/[.82] px-1.5 text-chip font-semibold text-white">
                      {i + 1}
                    </span>
                  </div>
                ) : (
                  <Link
                    href="/photos"
                    aria-label={i === 0 ? "Add a main photo of you" : `Add photo ${i + 1}`}
                    className="grid aspect-[4/5] min-h-11 w-full place-items-center content-center gap-0.5 rounded-md border-[1.5px] border-dashed border-green-500/50 bg-green-50 text-green-500 no-underline transition-colors hover:border-green-500"
                  >
                    <span aria-hidden="true" className="text-[20px] leading-none">+</span>
                    <span className="text-chip font-semibold">{i === 0 ? "Main" : "Add"}</span>
                  </Link>
                )}
              </li>
            ))}
          </ul>
          <div role="status" className="flex flex-wrap items-baseline justify-between gap-3">
            <span className="text-nav font-semibold text-ink-900">
              {filled} of {status.minPhotos}
            </span>
            {counterNote ? <span className="text-[13px] text-grey-600">{counterNote}</span> : null}
          </div>
          <Link
            href="/photos"
            className="grid min-h-12 w-full place-items-center rounded-lg bg-green-500 px-5 py-3.5 text-button text-white no-underline hover:bg-green-600"
          >
            {checking ? "See your photo check" : "Add a photo"}
          </Link>
        </div>

        <p className="mx-0.5 text-ui leading-[1.6] text-ink-800">
          Your conversations and matches are safe. Everything comes back as soon as you&rsquo;re done.
        </p>

        <LinkList heading="Still open to you" items={links} />
      </AppColumn>
    </>
  );
}
