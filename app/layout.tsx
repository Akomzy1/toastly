import type { Metadata, Viewport } from "next";
import { Aleo, Inter } from "next/font/google";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
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
  title: {
    default: "Toastly",
    template: "%s · Toastly",
  },
  description: "Verified people, real intentions — all the way to the aisle.",
  manifest: "/manifest.webmanifest",
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
      </body>
    </html>
  );
}
