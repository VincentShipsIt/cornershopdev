import { serializeLocalServiceJsonLd } from "@/lib/local-service-json-ld";
import type { SiteDraftView } from "@/lib/site-draft";

export function LocalServiceStructuredData({
  draft,
  enabled,
}: {
  draft: SiteDraftView;
  enabled: boolean;
}) {
  if (!enabled) return null;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeLocalServiceJsonLd(draft) }}
    />
  );
}
