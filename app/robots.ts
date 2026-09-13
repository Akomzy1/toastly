import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/schema";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Member-facing surfaces are private by nature. Disallowing them is
      // belt-and-braces — they will also sit behind auth — but a locked
      // inbox or a Couple Mode timeline must never be crawlable.
      disallow: ["/api/", "/auth/", "/app/", "/signup", "/offline"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
