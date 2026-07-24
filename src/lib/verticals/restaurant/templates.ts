import type { RestaurantAttributes } from "@/lib/verticals/restaurant/schema";

export type RestaurantTemplateId =
  | "heritage"
  | "fresh"
  | "bold"
  | "nocturne"
  | "coastal"
  | "warm";

export type RestaurantTemplate = {
  id: RestaurantTemplateId;
  heroLayout: "split" | "immersive" | "card";
  menuLayout: "stack" | "columns" | "cards";
  brandClassName: string;
  titleClassName: string;
  sectionClassName: string;
  showMenuImagesByDefault: boolean;
  copy: Record<
    "en" | "fr",
    {
      menuEyebrow: string;
      menuHeading: string;
      featuredHeading: string;
      featuredSubheading: string;
    }
  >;
};

export const restaurantTemplates: Record<
  RestaurantTemplateId,
  RestaurantTemplate
> = {
  heritage: {
    id: "heritage",
    heroLayout: "split",
    menuLayout: "stack",
    brandClassName: "font-bold tracking-[-0.035em]",
    titleClassName:
      "font-extrabold leading-[0.9] tracking-[-0.055em] text-balance",
    sectionClassName: "border-t-2 border-current/15 pt-6",
    showMenuImagesByDefault: false,
    copy: {
      en: {
        menuEyebrow: "The menu",
        menuHeading: "Cooking guided by the season.",
        featuredHeading: "A few dishes",
        featuredSubheading: "Plates faithful to the season.",
      },
      fr: {
        menuEyebrow: "La carte",
        menuHeading: "Une cuisine guidée par la saison.",
        featuredHeading: "Quelques assiettes",
        featuredSubheading: "Des plats fidèles à la saison.",
      },
    },
  },
  fresh: {
    id: "fresh",
    heroLayout: "card",
    menuLayout: "cards",
    brandClassName: "font-semibold tracking-[-0.025em]",
    titleClassName:
      "font-semibold leading-[0.96] tracking-[-0.045em] text-balance",
    sectionClassName:
      "rounded-[1.5rem] border border-current/10 bg-white/45 p-6",
    showMenuImagesByDefault: true,
    copy: {
      en: {
        menuEyebrow: "Fresh today",
        menuHeading: "Bright food, clearly served.",
        featuredHeading: "What we are serving",
        featuredSubheading: "Fresh food, shown honestly.",
      },
      fr: {
        menuEyebrow: "Frais aujourd’hui",
        menuHeading: "Une cuisine fraîche, servie simplement.",
        featuredHeading: "À table aujourd’hui",
        featuredSubheading: "Des produits frais, sans artifice.",
      },
    },
  },
  bold: {
    id: "bold",
    heroLayout: "immersive",
    menuLayout: "cards",
    brandClassName: "font-black uppercase tracking-[-0.04em]",
    titleClassName:
      "font-black uppercase leading-[0.82] tracking-[-0.065em] text-balance",
    sectionClassName:
      "border-2 border-current bg-[var(--restaurant-accent)]/5 p-6 shadow-[6px_6px_0_currentColor]",
    showMenuImagesByDefault: true,
    copy: {
      en: {
        menuEyebrow: "The lineup",
        menuHeading: "Big flavour. No detours.",
        featuredHeading: "See what is cooking",
        featuredSubheading: "The food does the talking.",
      },
      fr: {
        menuEyebrow: "La sélection",
        menuHeading: "Du goût. Sans détour.",
        featuredHeading: "En cuisine",
        featuredSubheading: "Les plats parlent d’eux-mêmes.",
      },
    },
  },
  nocturne: {
    id: "nocturne",
    heroLayout: "split",
    menuLayout: "columns",
    brandClassName: "font-medium uppercase tracking-[0.16em]",
    titleClassName:
      "font-medium leading-[0.92] tracking-[-0.055em] text-balance",
    sectionClassName: "border-t border-current/20 pt-6",
    showMenuImagesByDefault: false,
    copy: {
      en: {
        menuEyebrow: "Menu",
        menuHeading: "Precision, texture and balance.",
        featuredHeading: "From the kitchen",
        featuredSubheading: "One visual language, plate by plate.",
      },
      fr: {
        menuEyebrow: "Menu",
        menuHeading: "Précision, texture et équilibre.",
        featuredHeading: "Depuis la cuisine",
        featuredSubheading: "Un même langage, assiette après assiette.",
      },
    },
  },
  coastal: {
    id: "coastal",
    heroLayout: "card",
    menuLayout: "columns",
    brandClassName: "font-semibold tracking-[-0.03em]",
    titleClassName:
      "font-semibold leading-[0.94] tracking-[-0.05em] text-balance",
    sectionClassName: "border-t border-current/15 pt-6",
    showMenuImagesByDefault: true,
    copy: {
      en: {
        menuEyebrow: "From the coast",
        menuHeading: "The catch, simply handled.",
        featuredHeading: "From sea to table",
        featuredSubheading: "Clean flavours in clear view.",
      },
      fr: {
        menuEyebrow: "Depuis la côte",
        menuHeading: "La pêche, cuisinée simplement.",
        featuredHeading: "De la mer à la table",
        featuredSubheading: "Des saveurs nettes et franches.",
      },
    },
  },
  warm: {
    id: "warm",
    heroLayout: "immersive",
    menuLayout: "columns",
    brandClassName: "font-bold tracking-[-0.035em]",
    titleClassName:
      "font-bold leading-[0.9] tracking-[-0.055em] text-balance",
    sectionClassName: "border-t border-current/15 pt-6",
    showMenuImagesByDefault: true,
    copy: {
      en: {
        menuEyebrow: "The menu",
        menuHeading: "Made here. Served when ready.",
        featuredHeading: "A look at the table",
        featuredSubheading: "The dishes, as they arrive.",
      },
      fr: {
        menuEyebrow: "La carte",
        menuHeading: "Fait maison. Servi au bon moment.",
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
