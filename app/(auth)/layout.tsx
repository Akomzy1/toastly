import Link from "next/link";
import { BrandLockup } from "@/components/brand-mark";

/**
 * Auth shell.
 *
 * NOT IN THE PROTOTYPE — flagged. No signup or sign-in screen exists in the
 * approved design. Built from the design system's own tokens: paper ground,
 * a single centred card, the lockup on deep green above it.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-paper">
      <div className="bg-green-800 px-5 py-5 md:px-10">
        <Link href="/" className="inline-flex min-h-11 items-center no-underline">
          <BrandLockup tone="dark" size={24} />
        </Link>
      </div>
      <main className="mx-auto grid max-w-[460px] gap-6 px-5 py-section-y">
        {children}
      </main>
    </div>
  );
}
