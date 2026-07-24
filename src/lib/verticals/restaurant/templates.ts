import type { RestaurantAttributes } from "@/lib/verticals/restaurant/schema";
import type { VerticalTemplateCopy } from "@/lib/verticals/types";

export type RestaurantTemplateId =
  | "heritage"
  | "fresh"
  | "bold"
  | "nocturne"
  | "coastal"
  | "warm";

/**
 * The six food templates stay restaurant-only — their copy is food-tuned. What is
 * shared with every other vertical is the layout contract
 * (`VerticalTemplateDefinition`); `showMenuImagesByDefault` is the one field that
 * exists here and deliberately never reaches the renderer.
 */
export type RestaurantTemplate = {
  id: RestaurantTemplateId;
  heroLayout: "split" | "immersive" | "card";
  catalogLayout: "stack" | "columns" | "cards";
  brandClassName: string;
  titleClassName: string;
  sectionClassName: string;
  showMenuImagesByDefault: boolean;
  copy: Record<"en" | "fr", VerticalTemplateCopy>;
};

export const restaurantTemplates: Record<
  RestaurantTemplateId,
  RestaurantTemplate
> = {
  heritage: {
    id: "heritage",
    heroLayout: "split",
    catalogLayout: "stack",
    brandClassName: "font-bold tracking-[-0.035em]",
    titleClassName:
      "font-extrabold leading-[0.9] tracking-[-0.055em] text-balance",
    sectionClassName: "border-t-2 border-current/15 pt-6",
    showMenuImagesByDefault: false,
    copy: {
      en: {
        catalogEyebrow: "The menu",
        catalogHeading: "Cooking guided by the season.",
        featuredHeading: "A few dishes",
        featuredSubheading: "Plates faithful to the season.",
      },
      fr: {
        catalogEyebrow: "La carte",
        catalogHeading: "Une cuisine guidée par la saison.",
        featuredHeading: "Quelques assiettes",
        featuredSubheading: "Des plats fidèles à la saison.",
      },
    },
  },
  fresh: {
    id: "fresh",
    heroLayout: "card",
    catalogLayout: "cards",
    brandClassName: "font-semibold tracking-[-0.025em]",
    titleClassName:
      "font-semibold leading-[0.96] tracking-[-0.045em] text-balance",
    sectionClassName:
      "rounded-[1.5rem] border border-current/10 bg-white/45 p-6",
    showMenuImagesByDefault: true,
    copy: {
      en: {
        catalogEyebrow: "Fresh today",
        catalogHeading: "Bright food, clearly served.",
        featuredHeading: "What we are serving",
        featuredSubheading: "Fresh food, shown honestly.",
      },
      fr: {
        catalogEyebrow: "Frais aujourd’hui",
        catalogHeading: "Une cuisine fraîche, servie simplement.",
        featuredHeading: "À table aujourd’hui",
        featuredSubheading: "Des produits frais, sans artifice.",
      },
    },
  },
  bold: {
    id: "bold",
    heroLayout: "immersive",
    catalogLayout: "cards",
    brandClassName: "font-black uppercase tracking-[-0.04em]",
    titleClassName:
      "font-black uppercase leading-[0.82] tracking-[-0.065em] text-balance",
    sectionClassName:
      "border-2 border-current bg-[var(--site-accent)]/5 p-6 shadow-[6px_6px_0_currentColor]",
    showMenuImagesByDefault: true,
    copy: {
      en: {
        catalogEyebrow: "The lineup",
        catalogHeading: "Big flavour. No detours.",
        featuredHeading: "See what is cooking",
        featuredSubheading: "The food does the talking.",
      },
      fr: {
        catalogEyebrow: "La sélection",
        catalogHeading: "Du goût. Sans détour.",
        featuredHeading: "En cuisine",
        featuredSubheading: "Les plats parlent d’eux-mêmes.",
      },
    },
  },
  nocturne: {
    id: "nocturne",
    heroLayout: "split",
    catalogLayout: "columns",
    brandClassName: "font-medium uppercase tracking-[0.16em]",
    titleClassName:
      "font-medium leading-[0.92] tracking-[-0.055em] text-balance",
    sectionClassName: "border-t border-current/20 pt-6",
    showMenuImagesByDefault: false,
    copy: {
      en: {
        catalogEyebrow: "Menu",
        catalogHeading: "Precision, texture and balance.",
        featuredHeading: "From the kitchen",
        featuredSubheading: "One visual language, plate by plate.",
      },
      fr: {
        catalogEyebrow: "Menu",
        catalogHeading: "Précision, texture et équilibre.",
        featuredHeading: "Depuis la cuisine",
        featuredSubheading: "Un même langage, assiette après assiette.",
      },
    },
  },
  coastal: {
    id: "coastal",
    heroLayout: "card",
    catalogLayout: "columns",
    brandClassName: "font-semibold tracking-[-0.03em]",
    titleClassName:
      "font-semibold leading-[0.94] tracking-[-0.05em] text-balance",
    sectionClassName: "border-t border-current/15 pt-6",
    showMenuImagesByDefault: true,
    copy: {
      en: {
        catalogEyebrow: "From the coast",
        catalogHeading: "The catch, simply handled.",
        featuredHeading: "From sea to table",
        featuredSubheading: "Clean flavours in clear view.",
      },
      fr: {
        catalogEyebrow: "Depuis la côte",
        catalogHeading: "La pêche, cuisinée simplement.",
        featuredHeading: "De la mer à la table",
        featuredSubheading: "Des saveurs nettes et franches.",
      },
    },
  },
  warm: {
    id: "warm",
    heroLayout: "immersive",
    catalogLayout: "columns",
    brandClassName: "font-bold tracking-[-0.035em]",
    titleClassName:
      "font-bold leading-[0.9] tracking-[-0.055em] text-balance",
    sectionClassName: "border-t border-current/15 pt-6",
    showMenuImagesByDefault: true,
    copy: {
      en: {
        catalogEyebrow: "The menu",
        catalogHeading: "Made here. Served when ready.",
        featuredHeading: "A look at the table",
        featuredSubheading: "The dishes, as they arrive.",
      },
      fr: {
        catalogEyebrow: "La carte",
        catalogHeading: "Fait maison. Servi au bon moment.",
        featuredHeading: "À table",
        featuredSubheading: "Les plats, tels qu’ils arrivent.",
      },
    },
  },
};

const templateRules: Array<{
  template: RestaurantTemplateId;
  pattern: RegExp;
}> = [
  {
    template: "heritage",
    pattern: /french|française|gastronom|bistro|brasserie|tradition/i,
  },
  {
    template: "fresh",
    pattern: /healthy|vegan|vegetarian|organic|salad|juice|wellness/i,
  },
  {
    template: "bold",
    pattern: /american|burger|barbecue|bbq|steak|diner|tex.?mex|hot dog/i,
  },
  {
    template: "nocturne",
    pattern: /japanese|sushi|ramen|izakaya|korean|omakase/i,
  },
  {
    template: "coastal",
    pattern: /seafood|fish|oyster|coastal|maritime/i,
  },
  {
    template: "warm",
    pattern: /italian|pizza|pasta|osteria|mediterranean|spanish|tapas/i,
  },
];

export function resolveRestaurantTemplate(
  cuisine: string,
): RestaurantTemplate {
  return resolveRestaurantTemplateFromAttributes({
    cuisine,
    showMenuImages: false,
  });
}

export function resolveRestaurantTemplateFromAttributes(
  attributes: RestaurantAttributes,
): RestaurantTemplate {
  const { cuisine } = attributes;
  const rule = templateRules.find(({ pattern }) => pattern.test(cuisine));
  return restaurantTemplates[rule?.template ?? "warm"];
}

export function shouldShowMenuImagesByDefault(cuisine: string): boolean {
  return resolveRestaurantTemplate(cuisine).showMenuImagesByDefault;
}
