/**
 * schema.org structured data.
 *
 * One rule governs what goes in here: structured data is an assertion to
 * search engines, so only facts that are actually true may be marked up.
 *
 * That rules out two tempting sources. The member counts on Home and Stories
 * ("42,180 verified members") and the star reviews on Stories are prototype
 * placeholder content, not measured figures. Marking them up as
 * InteractionCounter or AggregateRating would publish invented numbers and
 * invented ratings as machine-readable claims — rich-result eligible, and
 * exactly the kind of thing a trust-first brand cannot be caught doing.
 * Neither is included. Add them when the numbers are real.
 */

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://toastly.ng";

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Toastly",
    legalName: "Toastly Technologies Ltd",
    url: SITE_URL,
    logo: `${SITE_URL}/icons/icon-512.png`,
    image: `${SITE_URL}/og-1200x630.png`,
    description:
      "A verification-first dating-to-marriage platform for Nigerians, at home and in the diaspora.",
    foundingLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Lagos",
        addressCountry: "NG",
      },
    },
    areaServed: [
      { "@type": "Country", name: "Nigeria" },
      { "@type": "Country", name: "United States" },
      { "@type": "Country", name: "United Kingdom" },
      { "@type": "Country", name: "Canada" },
    ],
  };
}

/**
 * Offers use PRD §7.1's authoritative prices. The two currency tracks stay
 * separate here as they do on the page — they are different products for
 * different members, not one price converted.
 */
export function softwareApplicationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Toastly",
    applicationCategory: "LifestyleApplication",
    operatingSystem: "Web, Android, iOS",
    url: SITE_URL,
    description:
      "Verified people, real intentions. Voice-first Gist sessions, six matches a day, no swiping — from first conversation through to the wedding.",
    offers: [
      {
        "@type": "Offer",
        name: "Starter",
        price: "0",
        priceCurrency: "NGN",
        description:
          "Verified Real profile, six matches a day, 2 voice Gist sessions a month, Couple Mode and the AriyaPlanner handoff.",
      },
      {
        "@type": "Offer",
        name: "Premium",
        price: "3500",
        priceCurrency: "NGN",
        description: "Unlimited voice Gist sessions, priority match feed, advanced filters.",
      },
      {
        "@type": "Offer",
        name: "Premium Plus",
        price: "7000",
        priceCurrency: "NGN",
        description: "Everything in Premium, plus live-video Gist and incognito mode.",
      },
      {
        "@type": "Offer",
        name: "Diaspora",
        price: "15",
        priceCurrency: "USD",
        description:
          "Both matching pools, unlimited voice Gist, time-zone aware scheduling, advanced filters.",
      },
      {
        "@type": "Offer",
        name: "Diaspora Plus",
        price: "30",
        priceCurrency: "USD",
        description: "Everything in Diaspora, plus live-video Gist and priority support.",
      },
    ],
  };
}

/** FAQPage for a page that actually renders those questions and answers. */
export function faqPageSchema(faqs: [string, string][]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(([question, answer]) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };
}

export function breadcrumbSchema(trail: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.name,
      item: `${SITE_URL}${t.path}`,
    })),
  };
}
