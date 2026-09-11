/**
 * Scaffold placeholder.
 *
 * Prompt 0 is explicitly scaffold-only — "do not build any feature UI yet".
 * The real home page is Prompt 2 and must be built against
 * design/prototype/home.slim.html, not invented here.
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-measure flex-col justify-center gap-4 px-section-x py-section-y">
      <p className="text-caption uppercase text-grey-600">Scaffold only</p>
      <h1 className="text-h3 text-ink-900">Toastly</h1>
      <p className="text-body text-grey-600">
        Project scaffold. No feature UI has been built yet — pages are built
        per-prompt against their approved prototype in{" "}
        <code className="rounded-sm bg-grey-100 px-1">design/prototype/</code>.
      </p>
    </main>
  );
}
