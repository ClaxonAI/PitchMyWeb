// Structured data, emitted as a plain <script> rather than through the
// metadata API because Next has no metadata field for JSON-LD.
//
// The "<" escape is not optional. JSON.stringify happily produces the literal
// characters `</script>` if any string in the graph contains them, which ends
// the script element early and drops the rest of the page's markup into the
// document as text. The data here is all first-party and static today, but the
// FAQ copy is editable by anyone touching src/data/faq.ts, so the escape stays.
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\u003c") }}
    />
  );
}
