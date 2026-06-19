/**
 * Generic JSON-LD renderer for content pages (articles, hub).
 *
 * Distinct from `JsonLd.tsx`, which carries the fixed homepage
 * Organization + SoftwareApplication + FAQ schema. This one takes arbitrary
 * structured-data objects (built via `lib/seo/structuredData.ts`) and emits
 * one <script type="application/ld+json"> per block. Server component — the
 * data ships in the initial HTML.
 */
export function StructuredData({
  data,
}: {
  data: Record<string, unknown> | Record<string, unknown>[];
}) {
  const blocks = Array.isArray(data) ? data : [data];
  return (
    <>
      {blocks.map((block, i) => (
        <script
          key={i}
          type="application/ld+json"
          // Built server-side from trusted, static content.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(block) }}
        />
      ))}
    </>
  );
}
