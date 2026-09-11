export const metadata = { title: "Offline" };

/** Cached by the service worker as the offline fallback. */
export default function Offline() {
  return (
    <main className="mx-auto flex min-h-screen max-w-measure flex-col justify-center gap-4 px-section-x py-section-y">
      <h1 className="text-h4 text-ink-900">You&rsquo;re offline</h1>
      <p className="text-body text-grey-600">
        Toastly can&rsquo;t reach the network right now. This page will reload
        itself once you&rsquo;re back on.
      </p>
    </main>
  );
}
