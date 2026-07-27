import { describe, expect, it } from "bun:test";
import { Vertical } from "@/generated/prisma/enums";
import { resolveBookingEmbed } from "@/lib/booking-embed";
import type { SiteIntegrationView } from "@/lib/site-draft";
import {
  listEmbedFrameOrigins,
  listVerticalIds,
  resolveVerticalConfig,
} from "@/lib/verticals/registry";

/**
 * `resolveBookingEmbed` is the only thing standing between owner-influenced input
 * and a third-party frame on a customer-facing site, and `BookingEmbed` renders
 * whatever it returns without re-checking. So the interesting assertions here are
 * the ones that return `null`: a site that degrades to a link-out renders no
 * frame at all, which is the property the CSP is a second line of defence for.
 */
function bookingIntegration(
  overrides: Partial<SiteIntegrationView> = {},
): SiteIntegrationView {
  return {
    type: "booking",
    label: "Reserve a table",
    provider: "OpenTable",
    url: "https://www.opentable.com/r/le-petit-meunier?rid=123456",
    enabled: true,
    venueId: null,
    ...overrides,
  };
}

describe("booking embed — allowed", () => {
  it("frames the one restaurant provider that publishes a widget", () => {
    const embed = resolveBookingEmbed(Vertical.RESTAURANT, bookingIntegration());

    expect(embed).not.toBeNull();
    expect(embed?.provider).toBe("OpenTable");
    expect(embed?.origin).toBe("https://www.opentable.com");
    expect(new URL(embed!.src).origin).toBe("https://www.opentable.com");
    expect(new URL(embed!.src).searchParams.get("rid")).toBe("123456");
  });

  /**
   * A stored `venueId` is the editor's answer and beats whatever the imported URL
   * happened to carry, but it goes through the same `idPattern` — being typed by
   * the owner rather than scraped makes it no less untrusted.
   */
  it("prefers a stored venue id over the one in the URL", () => {
    const embed = resolveBookingEmbed(
      Vertical.RESTAURANT,
      bookingIntegration({ venueId: "987654" }),
    );

    expect(new URL(embed!.src).searchParams.get("rid")).toBe("987654");
  });
});

describe("booking embed — degrades to a link-out", () => {
  /**
   * The venue id reaches `buildSrc` as a query value, so an id that is not a
   * bare integer is the input worth being unpleasant about. `$` in JavaScript is
   * end-of-input rather than end-of-line as long as no `m` flag is set, which is
   * what makes the trailing-newline case a rejection here and a footgun in most
   * other regex dialects — `every embed anchors its id pattern` below is what
   * keeps it that way.
   */
  it.each([
    ["absent", "https://www.opentable.com/r/le-petit-meunier"],
    ["empty", "https://www.opentable.com/r/x?rid="],
    ["non-numeric", "https://www.opentable.com/r/x?rid=abc"],
    ["mixed", "https://www.opentable.com/r/x?rid=123abc"],
    ["over-long", "https://www.opentable.com/r/x?rid=1234567890123"],
    ["newline-suffixed", "https://www.opentable.com/r/x?rid=123%0A456"],
    ["path-traversal", "https://www.opentable.com/r/x?rid=..%2F..%2Fevil"],
    ["spaced", "https://www.opentable.com/r/x?rid=123%20456"],
  ])("renders no frame for a %s venue id", (_label, url) => {
    expect(
      resolveBookingEmbed(Vertical.RESTAURANT, bookingIntegration({ url })),
    ).toBeNull();
  });

  it("renders no frame for a malformed stored venue id", () => {
    for (const venueId of ["", "abc", "12 34", "123\n456", "1234567890123"]) {
      expect(
        resolveBookingEmbed(Vertical.RESTAURANT, bookingIntegration({ venueId })),
      ).toBeNull();
    }
  });

  it("renders no frame for a provider no vertical registers", () => {
    expect(
      resolveBookingEmbed(
        Vertical.RESTAURANT,
        bookingIntegration({
          provider: "Some Booking Tool",
          url: "https://booking.example.com/venue/123?rid=123456",
        }),
      ),
    ).toBeNull();
  });

  /**
   * Registered, but publishing a script-tag widget rather than a documented
   * iframe URL. These are the majority, and their absence of an `embed` is the
   * degrade path working as designed rather than missing coverage.
   */
  it.each([
    ["SevenRooms", "https://www.sevenrooms.com/reservations/venue"],
    ["Resy", "https://resy.com/cities/par/venue"],
    ["TheFork", "https://www.thefork.fr/restaurant/venue-r123456"],
    ["Zenchef", "https://bookings.zenchef.com/results?rid=123456"],
    ["Quandoo", "https://www.quandoo.de/place/venue-123456"],
  ])("renders no frame for %s, which publishes no iframe", (_name, url) => {
    expect(
      resolveBookingEmbed(
        Vertical.RESTAURANT,
        bookingIntegration({ provider: _name, url, venueId: "123456" }),
      ),
    ).toBeNull();
  });

  /**
   * The security-relevant one. `provider` is a free-text label that survives an
   * AI extraction pass and is editable, so the provider is looked up by URL
   * instead — a label reading "OpenTable" on a URL nobody registered must not
   * borrow OpenTable's place on the CSP allow-list.
   */
  it("never lets the provider label pick the provider", () => {
    expect(
      resolveBookingEmbed(
        Vertical.RESTAURANT,
        bookingIntegration({
          provider: "OpenTable",
          url: "https://evil.example.com/reserve?rid=123456",
          venueId: "123456",
        }),
      ),
    ).toBeNull();
  });

  /**
   * Provider matching is hostname-anchored. A hostile URL cannot select an
   * embed merely by placing a trusted provider name in its path.
   */
  it("does not frame a hostname whose path only looks like the provider", () => {
    const embed = resolveBookingEmbed(
      Vertical.RESTAURANT,
      bookingIntegration({ url: "https://evil.example.com/opentable?rid=7" }),
    );

    expect(embed).toBeNull();
  });

  /**
   * An embeddable URL filed under any other integration type is a link in a
   * footer, not a booking widget, and must not become a frame because the
   * importer classified it loosely.
   */
  it.each(["ordering", "delivery", "social"] as const)(
    "renders no frame for an embeddable URL typed as %s",
    (type) => {
      expect(
        resolveBookingEmbed(Vertical.RESTAURANT, bookingIntegration({ type })),
      ).toBeNull();
    },
  );

  /**
   * Beauty registers eight booking providers and deliberately gives none of them
   * an embed, so the whole vertical is on the link-out path. This asserts that
   * as a property of the vertical rather than provider by provider, so a future
   * descriptor added there has to be a deliberate edit to this test too.
   */
  it("frames nothing at all in a vertical that registers no widget", () => {
    for (const provider of resolveVerticalConfig(Vertical.BEAUTY).providers) {
      expect(provider.embed).toBeUndefined();
    }

    for (const url of [
      "https://booksy.com/en-us/123456_salon",
      "https://www.fresha.com/a/salon-123456",
      "https://www.vagaro.com/salon",
      "https://www.styleseat.com/m/v/salon",
      "https://getsquire.com/barbershop",
      "https://www.planity.com/salon-75001",
    ]) {
      expect(
        resolveBookingEmbed(
          Vertical.BEAUTY,
          bookingIntegration({ url, venueId: "123456" }),
        ),
      ).toBeNull();
    }
  });
});

/**
 * The CSP is built once at module load from these same provider tables, so the
 * invariant that matters is not what the header says today but that it cannot
 * drift from what `resolveBookingEmbed` will actually hand to an iframe.
 */
describe("booking embed — CSP allow-list", () => {
  const allowed = listEmbedFrameOrigins();

  it("allows exactly the origins the provider tables declare", () => {
    const declared = new Set(
      listVerticalIds().flatMap((id) =>
        resolveVerticalConfig(id)
          .providers.map((provider) => provider.embed?.origin)
          .filter((origin): origin is string => Boolean(origin)),
      ),
    );

    expect(new Set(allowed)).toEqual(declared);
    expect(allowed).toEqual([...allowed].sort());
  });

  /**
   * A `frame-src` entry carrying a path is silently useless and one carrying a
   * wildcard is silently dangerous, so descriptors are held to scheme + host.
   */
  it("declares every origin as scheme and host only", () => {
    for (const origin of allowed) {
      expect(new URL(origin).origin).toBe(origin);
      expect(origin).toStartWith("https://");
      expect(origin).not.toContain("*");
    }
  });

  /**
   * The anchoring the `idPattern` doc comment asks for, enforced rather than
   * trusted: an unanchored pattern would match a valid id *inside* a hostile
   * string, and an `m` flag would turn `$` into end-of-line and let a newline
   * carry a payload past it.
   */
  it("anchors every embed id pattern", () => {
    for (const id of listVerticalIds()) {
      for (const provider of resolveVerticalConfig(id).providers) {
        if (!provider.embed) continue;
        const { idPattern } = provider.embed;

        expect(idPattern.source).toStartWith("^");
        expect(idPattern.source).toEndWith("$");
        expect(idPattern.flags).not.toContain("m");
        expect(idPattern.test("")).toBe(false);
      }
    }
  });

  /**
   * The closing invariant: nothing `resolveBookingEmbed` returns can ever be
   * framed from an origin the policy does not list. `BookingEmbed` trusts its
   * input completely, so this is where that trust is earned.
   */
  it("resolves no embed onto an origin the policy would block", () => {
    const embed = resolveBookingEmbed(Vertical.RESTAURANT, bookingIntegration());

    expect(allowed).toContain(embed!.origin);
    expect(allowed).toContain(new URL(embed!.src).origin);
  });
});
