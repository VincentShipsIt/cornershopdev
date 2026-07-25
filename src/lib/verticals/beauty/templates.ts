import type {
  BeautyAttributes,
  ServiceStyle,
} from "@/lib/verticals/beauty/schema";
import type { VerticalTemplateCopy } from "@/lib/verticals/types";

/**
 * Same layout contract as the restaurant templates, with the beauty equivalent of
 * `showMenuImagesByDefault`: a barbershop price list reads better as plain rows,
 * a nail studio sells on the photograph.
 */
export type BeautyTemplate = {
  id: ServiceStyle;
  heroLayout: "split" | "immersive" | "card";
  catalogLayout: "stack" | "columns" | "cards";
  brandClassName: string;
  titleClassName: string;
  sectionClassName: string;
  showServiceImagesByDefault: boolean;
  copy: Record<"en" | "fr", VerticalTemplateCopy>;
};

/**
 * Keyed by `serviceStyle` itself rather than by a separate template id. The
 * restaurant needs a regex table because `cuisine` is free text; a controlled
 * enum makes selection a lookup that cannot miss, so there is no default branch
 * and no template that is unreachable.
 */
export const beautyTemplates: Record<ServiceStyle, BeautyTemplate> = {
  barbershop: {
    id: "barbershop",
    heroLayout: "split",
    catalogLayout: "stack",
    brandClassName: "font-black uppercase tracking-[-0.03em]",
    titleClassName:
      "font-extrabold uppercase leading-[0.86] tracking-[-0.055em] text-balance",
    sectionClassName: "border-t-2 border-current/20 pt-6",
    showServiceImagesByDefault: false,
    copy: {
      en: {
        catalogEyebrow: "Services",
        catalogHeading: "Cuts, shaves and upkeep.",
        featuredHeading: "In the chair",
        featuredSubheading: "Straightforward work, priced up front.",
      },
      fr: {
        catalogEyebrow: "Prestations",
        catalogHeading: "Coupes, rasages et entretien.",
        featuredHeading: "Au fauteuil",
        featuredSubheading: "Un travail net, au prix annoncé.",
      },
    },
  },
  "classic-salon": {
    id: "classic-salon",
    heroLayout: "split",
    catalogLayout: "columns",
    brandClassName: "font-semibold tracking-[-0.03em]",
    titleClassName:
      "font-semibold leading-[0.94] tracking-[-0.05em] text-balance",
    sectionClassName: "border-t border-current/15 pt-6",
    showServiceImagesByDefault: false,
    copy: {
      en: {
        catalogEyebrow: "Our services",
        catalogHeading: "Colour, cut and care.",
        featuredHeading: "In the salon",
        featuredSubheading: "Every service with its time and price.",
      },
      fr: {
        catalogEyebrow: "Nos prestations",
        catalogHeading: "Couleur, coupe et soin.",
        featuredHeading: "Au salon",
        featuredSubheading: "Chaque prestation, sa durée et son prix.",
      },
    },
  },
  "modern-studio": {
    id: "modern-studio",
    heroLayout: "card",
    catalogLayout: "cards",
    brandClassName: "font-semibold tracking-[-0.025em]",
    titleClassName:
      "font-semibold leading-[0.96] tracking-[-0.045em] text-balance",
    sectionClassName:
      "rounded-[1.5rem] border border-current/10 bg-white/45 p-6",
    showServiceImagesByDefault: true,
    copy: {
      en: {
        catalogEyebrow: "Studio menu",
        catalogHeading: "Considered work, clearly priced.",
        featuredHeading: "Recent work",
        featuredSubheading: "What the studio actually does.",
      },
      fr: {
        catalogEyebrow: "Carte du studio",
        catalogHeading: "Un travail soigné, au prix clair.",
        featuredHeading: "Réalisations",
        featuredSubheading: "Ce que le studio fait vraiment.",
      },
    },
  },
  "spa-luxe": {
    id: "spa-luxe",
    heroLayout: "immersive",
    catalogLayout: "columns",
    brandClassName: "font-medium uppercase tracking-[0.16em]",
    titleClassName:
      "font-medium leading-[0.92] tracking-[-0.05em] text-balance",
    sectionClassName: "border-t border-current/20 pt-6",
    showServiceImagesByDefault: true,
    copy: {
      en: {
        catalogEyebrow: "Treatments",
        catalogHeading: "Time set aside for you.",
        featuredHeading: "The treatment list",
        featuredSubheading: "Each ritual with its duration.",
      },
      fr: {
        catalogEyebrow: "Soins",
        catalogHeading: "Un temps réservé pour vous.",
        featuredHeading: "La carte des soins",
        featuredSubheading: "Chaque rituel avec sa durée.",
      },
    },
  },
  "express-nails": {
    id: "express-nails",
    heroLayout: "immersive",
    catalogLayout: "cards",
    brandClassName: "font-bold tracking-[-0.035em]",
    titleClassName: "font-bold leading-[0.9] tracking-[-0.055em] text-balance",
    sectionClassName:
      "border-2 border-current bg-[var(--site-accent)]/5 p-6 shadow-[6px_6px_0_currentColor]",
    showServiceImagesByDefault: true,
    copy: {
      en: {
        catalogEyebrow: "The list",
        catalogHeading: "In and out, looking sharp.",
        featuredHeading: "Latest sets",
        featuredSubheading: "Finishes exactly as shown.",
      },
      fr: {
        catalogEyebrow: "La liste",
        catalogHeading: "Vite fait, bien fait.",
        featuredHeading: "Dernières poses",
        featuredSubheading: "Des finitions telles qu’affichées.",
      },
    },
  },
};

export function resolveBeautyTemplateFromAttributes(
  attributes: BeautyAttributes,
): BeautyTemplate {
  return beautyTemplates[attributes.serviceStyle];
}
