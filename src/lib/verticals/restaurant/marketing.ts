import type { VerticalMarketing } from "@/lib/verticals/types";

/**
 * Restofrontapp is the restaurant niche's public brand. The platform rename to
 * Cornershopdev covers the factory, not the storefronts it ships. A visitor on
 * restofront.com should never see the factory's name, the same way a visitor to
 * a generated site never sees either.
 */
export const restaurantMarketing = {
  hostnames: ["restofront.com", "www.restofront.com"],
  domain: "restofront.com",
  brand: {
    name: "Restofrontapp",
    initials: "RA",
    mark: {
      src: "/brand/restofrontapp/mark.png",
      faviconSrc: "/brand/restofrontapp/favicon-32.png",
      appleTouchIconSrc: "/brand/restofrontapp/apple-touch-icon.png",
    },
  },
  // send.restofront.com is the verified sending domain; nobody reads it, so
  // replies are pointed at the bare domain instead.
  email: {
    from: "Vincent from Restofrontapp <vincent@send.restofront.com>",
    replyTo: "vincent@restofront.com",
  },
  audience: "restaurants",
  tagline: "Menus, bookings and hours that stay current on their own.",
  heroVisual: "transformation",
  hero: {
    badge: "Your old site in. A finished one out.",
    headline: "Your front door, always current.",
    subheadline:
      "Give us the restaurant. Get back a polished mobile-first website with the menu already inside—and keep the booking and ordering tools that already work.",
    proofPoints: ["No setup call", "Private preview first", "From $25/month"],
  },
  form: {
    placeholder: "Restaurant website or name",
    label: "Restaurant website or name",
    submitLabel: "Show my preview",
    pendingLabel: "Opening your restaurant",
  },
  themeGallery: {
    href: "/themes/restaurant",
    label: "Browse themes",
  },
  steps: [
    {
      number: "01",
      title: "Drop the old website",
      copy: "Paste a URL or restaurant name. Restofrontapp recovers the menu, contact details, imagery and current integrations.",
    },
    {
      number: "02",
      title: "Review the finished preview",
      copy: "A private mobile-first site arrives ready to inspect—not another empty template asking for setup work.",
    },
    {
      number: "03",
      title: "Claim it and go live",
      copy: "Choose a plan, connect the domain, and keep every booking and ordering system already in place.",
    },
  ],
  valueProps: {
    eyebrow: "The digital presence custodian",
    headline: "We improve the website. Not your whole operation.",
    copy: "Restofrontapp sits around the systems a restaurant already trusts, presenting them beautifully without forcing a painful migration.",
    items: [
      {
        icon: "catalog",
        title: "A menu people can actually use",
        copy: "Structured, searchable and designed for thumbs—not a tiny PDF trapped behind three taps.",
      },
      {
        icon: "imagery",
        title: "Food imagery that fits",
        copy: "Recover the best existing photography and generate missing editorial images without inventing dishes.",
      },
      {
        icon: "booking",
        title: "Bookings stay untouched",
        copy: "OpenTable, SevenRooms, Resy, TheFork and custom booking links remain the source of truth.",
      },
      {
        icon: "refresh",
        title: "Always-current presence",
        copy: "Menu, hours and integration checks become an ongoing service, not another redesign project.",
      },
    ],
  },
  imagery: {
    imageUrl:
      "https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=1400&q=85",
    imageAlt: "Restaurant dish photographed in natural light",
    eyebrow: "Credible imagery, not fantasy food",
    headline: "Fill the visual gaps without faking the restaurant.",
    copy: "Restofrontapp prioritises real source photography, then creates complementary editorial images for missing categories. Every generated asset stays reviewable before publishing.",
    assurances: [
      {
        icon: "shield",
        copy: "No invented prices, allergens or booking availability",
      },
      {
        icon: "cursor",
        copy: "One click to regenerate, replace or remove any image",
      },
    ],
  },
  pricing: {
    eyebrow: "Simple ongoing care",
    headline: "Less than one empty table.",
    copy: "Preview first. Pay only when the restaurant wants to claim and publish it.",
    plans: [
      {
        name: "Starter",
        price: "$25",
        cadence: "/month",
        copy: "The always-current essentials for one independent restaurant.",
        features: [
          "Mobile-first website and menu",
          "Existing booking and ordering links",
          "Custom domain and SSL",
          "Monthly source checks",
        ],
      },
      {
        name: "Growth",
        price: "$50",
        cadence: "/month",
        copy: "For restaurants that change often and want the work handled.",
        features: [
          "Everything in Starter",
          "Weekly menu and hours monitoring",
          "AI-assisted food imagery",
          "Priority human review queue",
        ],
        featured: true,
        badge: "Most useful",
      },
    ],
  },
  closing: {
    headline: "See the restaurant before asking it to change.",
    copy: "Paste one website. Restofrontapp will do the first draft.",
  },
  footerTagline: "Your restaurant's front door, always current.",
} satisfies VerticalMarketing;
