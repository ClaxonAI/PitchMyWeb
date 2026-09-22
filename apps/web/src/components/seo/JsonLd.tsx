// Renders a schema.org graph as JSON-LD.
//
// <script type="application/ld+json"> is inert — the browser never executes it
// — so dangerouslySetInnerHTML is the documented way to emit it in React, and
// is what Next's own docs show. The content is built from our own data files,
// never from user input; JSON.stringify plus the "</" escape below is what
// keeps a stray sequence in copy from closing the tag early.
export function JsonLd({ schema }: { schema: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\u003c") }}
    />
  );
}
