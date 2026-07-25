import type { ResolvedBookingEmbed } from "@/lib/booking-embed";

type BookingEmbedProps = {
  embed: ResolvedBookingEmbed;
  title: string;
  /** Rendered instead of the frame inside our own previews. */
  previewNotice: string;
  embedded?: boolean;
};

/**
 * Renders a provider's own booking widget inline.
 *
 * This component is deliberately dumb: it never decides *whether* an embed is
 * allowed. `resolveBookingEmbed` does that against the vertical's provider table,
 * and a site whose booking provider publishes no embed simply never renders this
 * — the degrade path is the absence of the component, not a branch inside it, so
 * "no third-party frame" is a structural property rather than a code path that
 * could be reached with the wrong argument.
 *
 * Inside our own chrome (`embedded`: the claim preview) the frame is replaced by
 * a placeholder. A 0.72-scaled device mock renders a fixed-height third-party
 * widget as a broken sliver, and loading a booking provider's script from our
 * acquisition funnel to achieve that is a bad trade twice over.
 */
export function BookingEmbed({
  embed,
  title,
  previewNotice,
  embedded = false,
}: BookingEmbedProps) {
  if (embedded) {
    return (
      <div
        className="flex items-center justify-center rounded-2xl border border-dashed border-current/25 px-6 text-center text-sm opacity-60"
        style={{ height: embed.height }}
      >
        {previewNotice}
      </div>
    );
  }

  return (
    <iframe
      src={embed.src}
      title={title}
      height={embed.height}
      loading="lazy"
      // `allow-scripts` with `allow-same-origin` only restores the provider's
      // own origin to itself; what matters is what stays omitted —
      // `allow-top-navigation`, so a third-party widget can never navigate the
      // owner's site away from under a customer.
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
      className="w-full rounded-2xl border border-current/15 bg-white"
    />
  );
}
