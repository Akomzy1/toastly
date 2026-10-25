import type { Metadata } from "next";
import { BetaForm } from "./beta-form";
import { BETA_HONEYPOT_FIELD, BETA_LAGOS_AREAS, BETA_LOCATION_TYPES, BETA_SOURCES } from "@/lib/beta";

/**
 * PLACEHOLDER — pending the Claude Design prototype (beta.html). The prototype
 * is the source of truth for this page; when it arrives, restyle to it and
 * delete this note. Until then: the copy is the owner's, word for word, and the
 * page uses only existing components (Input, Select, Label, Button, Notice,
 * Card) and the header band the privacy page uses. No new pattern.
 */
export const metadata: Metadata = {
  title: "Join the Toastly founding members beta",
  description:
    "Toastly is a verified dating-to-marriage app for Nigerians. We're opening to 200 founding members in Lagos first.",
  alternates: { canonical: "/beta" },
};

export default function BetaPage() {
  return (
    <>
      <section className="bg-green-800 text-white">
        <div className="mx-auto max-w-container px-5 py-section-y md:px-10">
          <div className="grid max-w-[760px] gap-4">
            <p className="text-caption font-semibold uppercase text-champagne">Founding members</p>
            <h1 className="text-h2 text-white">Join the Toastly founding members beta.</h1>
            <p className="text-ui text-white/[.78]">
              Toastly is a verified dating-to-marriage app for Nigerians. We&rsquo;re opening to 200 founding members in
              Lagos first. Everyone is verified with a selfie check before they appear. Applying doesn&rsquo;t guarantee a
              place.
            </p>
            <p className="text-ui text-white/[.78]">
              Founding members get 3 months of Premium free from the day Toastly opens to everyone. It doesn&rsquo;t stack
              with other offers.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-paper">
        <div className="mx-auto grid max-w-[460px] gap-6 px-5 py-section-y">
          <BetaForm
            areas={BETA_LAGOS_AREAS}
            locationTypes={BETA_LOCATION_TYPES}
            sources={BETA_SOURCES}
            honeypotField={BETA_HONEYPOT_FIELD}
          />
        </div>
      </section>
    </>
  );
}
