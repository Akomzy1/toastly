import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Your account is being deleted",
  robots: { index: false, follow: false },
};

/**
 * The last screen of account-delete.slim.html ("Being deleted").
 *
 * Outside the signed-in app on purpose: the account and its session are
 * already gone, so the in-app layout would only bounce the member to sign
 * in. The mark is The Stake at its fixed geometry, on the light ground.
 */
export default function GoodbyePage() {
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-6 py-10 text-center">
      <div role="status" className="grid justify-items-center gap-[18px]">
        <svg width="64" height="64" viewBox="0 0 48 48" fill="none" aria-hidden="true">
          <circle cx="19" cy="20" r="9.5" stroke="#001F1B" strokeWidth="3" />
          <circle cx="29" cy="20" r="9.5" stroke="#CC8F00" strokeWidth="3" />
          <rect x="8" y="34" width="32" height="2.4" rx="1.2" fill="#001F1B" />
        </svg>
        <div className="grid max-w-[300px] gap-2.5">
          <h1 className="font-serif text-[24px] font-bold leading-[1.22] text-ink-900">Your account is being deleted.</h1>
          <p className="text-ui leading-[1.6] text-ink-800">Thank you for being part of Toastly.</p>
        </div>
        <Link href="/" className="text-nav text-green-500">
          trytoastly.com
        </Link>
      </div>
    </main>
  );
}
