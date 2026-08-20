import type { SiteDraftView } from "@/lib/site-draft";
import { cn } from "@/lib/utils";

export function SitePhotoGallery({
  draft,
  eyebrow,
  heading,
  className,
  enabled = true,
}: {
  draft: Pick<SiteDraftView, "name" | "galleryImages">;
  eyebrow: string;
  heading: string;
  className?: string;
  enabled?: boolean;
}) {
  if (!enabled || draft.galleryImages.length === 0) return null;

  return (
    <section
      data-site-photo-gallery
      className={cn(
        "border-t border-current/15 px-6 py-14 md:px-10 md:py-20",
        className,
      )}
    >
      <div className="mx-auto max-w-7xl">
        <p className="text-xs font-bold uppercase tracking-[0.18em] opacity-65">
          {eyebrow}
        </p>
        <h2 className="mt-3 max-w-3xl break-words text-3xl font-bold tracking-[-0.04em] md:text-5xl">
          {heading}
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {draft.galleryImages.map((image, index) => (
            <div
              key={`${image.originalUrl}-${index}`}
              className="relative aspect-[4/3] overflow-hidden rounded-[1.25rem] bg-black/5"
            >
              {/* Customer-owned immutable URLs deliberately bypass Next's
                  restricted optimizer; the fixed container prevents CLS. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.url}
                alt={`${draft.name} gallery photo ${index + 1}`}
                loading="lazy"
                decoding="async"
                data-image-provenance={image.provenance}
                className="absolute inset-0 size-full object-cover"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
