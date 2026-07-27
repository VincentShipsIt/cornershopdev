import type { z } from "zod";
import {
  restaurantDesignProfileSchema,
  type RestaurantDesignProfile,
  type RestaurantThemeId,
} from "@/lib/site-themes/restaurant/contracts";
import { selectDeterministicRestaurantTheme } from "@/lib/site-themes/restaurant/selection";
import {
  restaurantSiteDraftSchema,
  type RestaurantSiteDraft,
} from "@/lib/verticals/restaurant/schema";

export type RestaurantThemeFixture = RestaurantSiteDraft & {
  profile: RestaurantDesignProfile;
};

function fixture(
  draft: Omit<
    z.input<typeof restaurantSiteDraftSchema>,
    "attributes" | "autoEnhanceImages"
  > & {
    cuisine: string;
    profile: RestaurantDesignProfile;
  },
): RestaurantThemeFixture {
  const { cuisine, profile, ...site } = draft;
  const themeSelection = selectDeterministicRestaurantTheme(profile);
  const parsedDraft = restaurantSiteDraftSchema.parse({
    ...site,
    autoEnhanceImages: false,
    attributes: {
      cuisine,
      showMenuImages: true,
      designProfile: profile,
      themeSelection,
    },
  });

  return {
    ...parsedDraft,
    profile,
  };
}

const terroirProfile = restaurantDesignProfileSchema.parse({
  serviceModel: "fine-dining",
  primaryIntent: "reserve",
  menuExperience: "editorial",
  brandTraits: ["craft", "minimal"],
  pricePosition: "premium",
  locationCount: 1,
  photographyQuality: "strong",
});

const counterProfile = restaurantDesignProfileSchema.parse({
  serviceModel: "fast-casual",
  primaryIntent: "order",
  menuExperience: "commerce",
  brandTraits: ["energetic", "playful"],
  pricePosition: "value",
  locationCount: 3,
  photographyQuality: "strong",
});

const afterDarkProfile = restaurantDesignProfileSchema.parse({
  serviceModel: "bar-nightlife",
  primaryIntent: "reserve",
  menuExperience: "catalog",
  brandTraits: ["atmospheric", "classic"],
  pricePosition: "premium",
  locationCount: 1,
  photographyQuality: "strong",
});

export const restaurantThemeFixtures: Record<
  RestaurantThemeId,
  RestaurantThemeFixture
> = {
  "terroir-editorial": fixture({
    slug: "maison-serein",
    name: "Maison Serein",
    eyebrow: "Field, fire and the Maltese season",
    description:
      "A twelve-table dining room shaped by local growers, the day’s catch and a menu that changes whenever the island does.",
    cuisine: "Seasonal Mediterranean",
    address: "8 Triq il-Lvant, Rabat, Malta",
    phone: "+356 2100 1840",
    sourceUrl: null,
    heroImageUrl: "/themes/restaurant/terroir-editorial.webp",
    palette: {
      background: "#f2eee4",
      foreground: "#20231f",
      accent: "#7f3f2e",
    },
  defaultLocale: "en",
  businessHours: [],
    profile: terroirProfile,
    catalogSections: [
      {
        name: "Early summer",
        description: "A short menu served as four or seven courses",
        items: [
          {
            name: "Broad bean & sheep’s curd",
            description: "Green almond, preserved lemon, young herbs",
            price: 18,
            currency: "EUR",
            imageUrl: null,
            attributes: { dietaryLabels: ["vegetarian"] },
          },
          {
            name: "Line-caught lampuki",
            description: "Fennel pollen, grilled leaves, shellfish broth",
            price: 34,
            currency: "EUR",
            imageUrl: null,
            attributes: { dietaryLabels: ["gluten-free"] },
          },
          {
            name: "Seven-course table",
            description: "The full seasonal menu for the whole table",
            price: 92,
            currency: "EUR",
            imageUrl: null,
            attributes: { dietaryLabels: [] },
          },
        ],
      },
    ],
    integrations: [
      {
        type: "booking",
        label: "Reserve a table",
        provider: "SevenRooms",
        url: "https://www.sevenrooms.com",
        venueId: null,
      },
    ],
    translations: [],
  }),
  "counter-service": fixture({
    slug: "fold-pizza",
    name: "Fold Pizza",
    eyebrow: "Slices, whole pies, no detours",
    description:
      "A neighbourhood counter for blistered sourdough pizza, cold drinks and fast collection from lunch until late.",
    cuisine: "Modern Italian",
    address: "41 Old Theatre Street, Valletta, Malta",
    phone: "+356 2100 2550",
    sourceUrl: null,
    heroImageUrl: "/themes/restaurant/counter-service.webp",
    palette: {
      background: "#fff7df",
      foreground: "#172118",
      accent: "#d94028",
    },
  defaultLocale: "en",
  businessHours: [],
    profile: counterProfile,
    catalogSections: [
      {
        name: "Slices",
        description: "Cut to order from midday",
        items: [
          {
            name: "Tomato & pecorino",
            description: "Slow tomato, garlic oil, oregano, aged pecorino",
            price: 5,
            currency: "EUR",
            imageUrl: null,
            attributes: { dietaryLabels: ["vegetarian"] },
          },
          {
            name: "Spicy fennel",
            description: "Fennel sausage, chilli, mozzarella, spring onion",
            price: 6.5,
            currency: "EUR",
            imageUrl: null,
            attributes: { dietaryLabels: [] },
          },
        ],
      },
      {
        name: "Whole pies",
        description: "Twelve-inch sourdough pizzas",
        items: [
          {
            name: "The red one",
            description: "Tomato, confit garlic, basil, olive oil",
            price: 14,
            currency: "EUR",
            imageUrl: null,
            attributes: { dietaryLabels: ["vegan"] },
          },
          {
            name: "Potato & rosemary",
            description: "New potato, smoked mozzarella, rosemary, sea salt",
            price: 17,
            currency: "EUR",
            imageUrl: null,
            attributes: { dietaryLabels: ["vegetarian"] },
          },
        ],
      },
    ],
    integrations: [
      {
        type: "ordering",
        label: "Order for collection",
        provider: "Existing ordering",
        url: "https://example.com/order",
        venueId: null,
      },
      {
        type: "delivery",
        label: "Get delivery",
        provider: "Existing delivery",
        url: "https://example.com/delivery",
        venueId: null,
      },
    ],
    translations: [],
  }),
  "after-dark": fixture({
    slug: "nightjar-room",
    name: "Nightjar Room",
    eyebrow: "Cocktails, small plates and a midnight set",
    description:
      "An intimate bar and late dining room with live sessions, thoughtful drinks and tables held well into the night.",
    cuisine: "Cocktail bar & late dining",
    address: "12 Strait Street, Valletta, Malta",
    phone: "+356 2100 0312",
    sourceUrl: null,
    heroImageUrl: "/themes/restaurant/after-dark.webp",
    palette: {
      background: "#111010",
      foreground: "#f5efe4",
      accent: "#e85d3f",
    },
  defaultLocale: "en",
  businessHours: [],
    profile: afterDarkProfile,
    catalogSections: [
      {
        name: "House drinks",
        description: "Built for the room, poured until close",
        items: [
          {
            name: "Velvet Hour",
            description: "Rye, fig leaf, dry vermouth, walnut",
            price: 14,
            currency: "EUR",
            imageUrl: null,
            attributes: { dietaryLabels: [] },
          },
          {
            name: "Garden After Rain",
            description: "Gin, lovage, green apple, sparkling wine",
            price: 13,
            currency: "EUR",
            imageUrl: null,
            attributes: { dietaryLabels: ["vegan"] },
          },
        ],
      },
      {
        name: "Late plates",
        description: "From the kitchen until midnight",
        items: [
          {
            name: "Charred oyster mushrooms",
            description: "Black garlic, sesame, crisp shallot",
            price: 12,
            currency: "EUR",
            imageUrl: null,
            attributes: { dietaryLabels: ["vegan"] },
          },
          {
            name: "Short rib toast",
            description: "Braised beef, horseradish, pickled onion",
            price: 16,
            currency: "EUR",
            imageUrl: null,
            attributes: { dietaryLabels: [] },
          },
        ],
      },
    ],
    integrations: [
      {
        type: "booking",
        label: "Book tonight",
        provider: "Resy",
        url: "https://resy.com",
        venueId: null,
      },
      {
        type: "social",
        label: "Tonight’s programme",
        provider: "Instagram",
        url: "https://instagram.com",
        venueId: null,
      },
    ],
    translations: [],
  }),
};

export function getRestaurantThemeFixture(
  id: RestaurantThemeId,
): RestaurantThemeFixture {
  return restaurantThemeFixtures[id];
}
