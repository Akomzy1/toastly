import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Download your data (privacy policy §10: "download your data in a portable
 * format").
 *
 * ALWAYS OPEN: no tier check, and no live-profile guard — a member whose
 * access is paused can still take their data (PRD §5.1.2).
 *
 * The document is built by export_my_data() (0016), which can only ever
 * describe the caller and keeps the locked Starter inbox locked. This adds
 * the member's own sign-in details and short-lived links to their photo
 * files, so the download is complete without anything being made public.
 */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const { data, error } = await supabase.rpc("export_my_data");
  if (error || !data) {
    return NextResponse.json({ error: "Your data couldn't be gathered. Try again." }, { status: 500 });
  }

  const doc = data as Record<string, unknown> & { photos?: { path: string }[] };
  const photos = doc.photos ?? [];
  const { data: signed } = photos.length
    ? await supabase.storage
        .from("profile-photos")
        .createSignedUrls(photos.map((p) => p.path), 60 * 60 * 24)
    : { data: [] };

  // The consents the member gave, with the version of the wording each time.
  const { data: consents } = await supabase
    .from("consents")
    .select("kind, version, agreed_at")
    .order("agreed_at");

  const body = {
    about: "Everything Toastly holds about you, as of generated_at. Photo links expire 24 hours after download.",
    consents: consents ?? [],
    account: {
      email: user.email ?? null,
      phone: user.phone ? `+${user.phone.replace(/^\+/, "")}` : null,
      created_at: user.created_at,
    },
    ...doc,
    photos: photos.map((p) => ({
      ...p,
      download_url: signed?.find((s) => s.path === p.path)?.signedUrl ?? null,
    })),
  };

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="toastly-data-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
