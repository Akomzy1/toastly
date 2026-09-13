/**
 * Renders a JSON-LD block.
 *
 * The payload is built server-side from our own typed objects and never from
 * user input, so there is nothing here for a viewer to inject. `<` is still
 * escaped, because a literal `</script>` inside JSON would close the tag
 * early and break the page.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
