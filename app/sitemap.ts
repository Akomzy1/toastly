import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/schema";

/** The seven public marketing pages. Clean URLs, no query strings. */
const routes = [
  { path: "/", priority: 1 },
  { path: "/features", priority: 0.8 },
  { path: "/how-it-works", priority: 0.8 },
  { path: "/pricing", priority: 0.9 },
  { path: "/safety", priority: 0.8 },
  { path: "/diaspora", priority: 0.8 },
  { path: "/stories", priority: 0.7 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return routes.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified,
    changeFrequency: "weekly",
    priority: r.priority,
  }));
}
