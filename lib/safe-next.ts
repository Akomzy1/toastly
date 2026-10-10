/**
 * Where to go after signing in. PURE.
 *
 * Only a path on this site: it must start with one "/", and never "//" or
 * "/\" (which browsers treat as another host), a scheme, or whitespace. So a
 * link like /login?next=https://evil.example can never send anyone off-site.
 * Anything else falls back.
 */
export function safeNext(value: unknown, fallback = "/verify"): string {
  if (typeof value !== "string") return fallback;
  const v = value.trim();
  if (v.length === 0 || v.length > 300) return fallback;
  if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return fallback;
  if (/[\s\\]|%2f%2f|%5c|^\/[a-z]+:/i.test(v)) return fallback;
  return v;
}
