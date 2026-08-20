import { serializeFoodRetailJsonLd } from "@/lib/food-retail-json-ld";
import type { SiteDraftView } from "@/lib/site-draft";

export function FoodRetailStructuredData({
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
      dangerouslySetInnerHTML={{ __html: serializeFoodRetailJsonLd(draft) }}
    />
  );
}
