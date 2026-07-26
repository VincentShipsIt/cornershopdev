import type { VerticalMarketing } from "@/lib/verticals/types";

/**
 * Built and sellable, but not yet launched on its own domain — hence no
 * `hostnames` and a null `domain`. The factory homepage lists it as upcoming and
 * routes its leads through cornershop.dev's own studio; the day a domain exists
 * it is two strings here and a DNS record, with no route to add.
 *
 * `heroVisual: "none"` because the restaurant transformation mock is a menu PDF
 * turning into a menu — dressing it up as a salon would be a lie about what the
 * product has actually produced for this niche.
 */
export const beautyMarketing = {
  hostnames: [],
  domain: null,
  brand: { name: "Salonfront", initials: "SF" },
  // No domain yet, so no sending domain to verify either. Launching means a DNS
  // record, a verified sender, and these two strings — in that order.
  email: null,
  audience: "salons and barbers",
  tagline: "A service list and a booking button, always up to date.",
  heroVisual: "none",
  hero: {
    badge: "Your old site in. A finished one out.",
    headline: "Every service, priced and bookable.",
    subheadline:
      "Give us the salon. Get back a mobile-first website with the full service list, durations and prices already inside—and keep the booking system your clients already use.",
    proofPoints: ["No setup call", "Private preview first", "From $25/month"],
  },
  form: {
    placeholder: "Salon website or name",
    label: "Salon website or name",
    submitLabel: "Show my preview",
    pendingLabel: "Opening your salon",
  },
  steps: [
    {
      number: "01",
      title: "Drop the old website",
      copy: "Paste a URL or salon name. Salonfront recovers the service list, prices, contact details, imagery and current booking links.",
    },
    {
      number: "02",
      title: "Review the finished preview",
      copy: "A private mobile-first site arrives ready to inspect—not another empty template asking for setup work.",
    },
    {
      number: "03",
      title: "Claim it and go live",
      copy: "Choose a plan, connect the domain, and keep the booking system already taking appointments.",
    },
  ],
  valueProps: {
    eyebrow: "The digital presence custodian",
    headline: "We improve the website. Not your whole chair schedule.",
    copy: "Salonfront sits around the tools a salon already trusts, presenting them beautifully without forcing anyone to relearn a booking system.",
    items: [
      {
        icon: "catalog",
        title: "A service list clients can read",
        copy: "Every treatment with its duration and price, grouped and searchable—not a photo of a price board.",
      },
      {
        icon: "imagery",
        title: "Imagery that shows the room",
        copy: "Recover the best existing photography and fill the gaps with editorial images, never with invented results.",
      },
      {
        icon: "booking",
        title: "Bookings stay untouched",
        copy: "Booksy, Fresha, Treatwell, Planity and custom booking links remain the source of truth.",
      },
      {
        icon: "refresh",
        title: "Always-current presence",
        copy: "Prices, hours and integration checks become an ongoing service, not another redesign project.",
      },
    ],
  },
  imagery: {
    imageUrl:
      "https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?auto=format&fit=crop&w=1400&q=85",
    imageAlt: "Salon interior photographed in natural light",
    eyebrow: "Credible imagery, not fantasy results",
    headline: "Fill the visual gaps without faking the work.",
    copy: "Salonfront prioritises real source photography, then creates complementary editorial images for missing categories. Skin, hair and nail results are never regenerated, and every generated asset stays reviewable before publishing.",
    assurances: [
      {
        icon: "shield",
        copy: "No invented prices, durations or appointment availability",
      },
      {
        icon: "cursor",
        copy: "One click to regenerate, replace or remove any image",
      },
    ],
  },
  pricing: {
    eyebrow: "Simple ongoing care",
    headline: "Less than one empty chair.",
    copy: "Preview first. Pay only when the salon wants to claim and publish it.",
    plans: [
      {
        name: "Starter",
        price: "$25",
        cadence: "/month",
        copy: "The always-current essentials for one independent salon.",
        features: [
          "Mobile-first website and service list",
          "Existing booking links",
          "Custom domain and SSL",
          "Monthly source checks",
        ],
      },
      {
        name: "Growth",
        price: "$50",
        cadence: "/month",
        copy: "For salons that change their offer often and want the work handled.",
        features: [
          "Everything in Starter",
          "Weekly price and hours monitoring",
          "AI-assisted interior imagery",
          "Priority human review queue",
        ],
        featured: true,
        badge: "Most useful",
      },
    ],
  },
  closing: {
    headline: "See the salon before asking it to change.",
    copy: "Paste one website. Salonfront will do the first draft.",
  },
  footerTagline: "Every service, priced and bookable.",
} satisfies VerticalMarketing;
