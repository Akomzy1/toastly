import type { Metadata, Viewport } from "next";
import { Aleo, Inter } from "next/font/google";
import { JsonLd } from "@/components/json-ld";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import { organizationSchema, softwareApplicationSchema, SITE_URL } from "@/lib/schema";
import "./globals.css";

// Editorial serif for headings, clean sans for body/UI — design-system.slim.html.
const aleo = Aleo({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-aleo",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  // Required for the per-page `alternates.canonical` paths to resolve to
  // absolute URLs. Set NEXT_PUBLIC_SITE_URL per environment.
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Toastly",
    template: "%s · Toastly",
  },
  description: "Verified people, real intentions — all the way to the aisle.",
  manifest: "/manifest.webmanifest",
  // Icon set from design/prototype/brand-assets.slim.html ("The Stake").
  // The 48-unit geometry is fixed — each export is the same mark at a
  // different scale and ground, so do not redraw or substitute these.
  icons: {
    icon: [
      { url: "/icons/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    // No dedicated 180x180 in the set; 192 is the nearest approved export.
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    siteName: "Toastly",
    // Deliberately no `title` here. An openGraph.title set at the root wins
    // over every page's own title, so a shared /pricing link would read just
    // "Toastly"; an openGraph.title *template* does not help either, because
    // it only applies to pages that set their own openGraph.title. Omitting
    // it lets Next fall back to each page's resolved <title>.
    description: "Verified people, real intentions — all the way to the aisle.",
    images: [{ url: "/og-1200x630.png", width: 1200, height: 630 }],
  },
  appleWebApp: {
    capable: true,
    title: "Toastly",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#001F1B",
  width: "device-width",
  initialScale: 1,
  // Never block zoom — accessibility, and SKILL.md treats mobile as non-optional.
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${aleo.variable} ${inter.variable}`}>
      <body>
        {children}
        <ServiceWorkerRegistration />
        {/* Site-wide structured data. Page-specific FAQPage lives on the
            pages that actually render those questions. */}
        <JsonLd data={organizationSchema()} />
        <JsonLd data={softwareApplicationSchema()} />
      </body>
    </html>
  );
}
