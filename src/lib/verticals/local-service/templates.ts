import type {
  LocalServiceAttributes,
  LocalServiceTradeType,
} from "@/lib/verticals/local-service/schema";
import type { VerticalTemplateCopy } from "@/lib/verticals/types";

export type LocalServiceTemplate = {
  id: LocalServiceTradeType;
  heroLayout: "split" | "immersive" | "card";
  catalogLayout: "stack" | "columns" | "cards";
  brandClassName: string;
  titleClassName: string;
  sectionClassName: string;
  showProjectImagesByDefault: boolean;
  copy: Record<"en", VerticalTemplateCopy>;
};

const sharedTitle =
  "font-extrabold leading-[0.9] tracking-[-0.055em] text-balance";

export const localServiceTemplates: Record<
  LocalServiceTradeType,
  LocalServiceTemplate
> = {
  plumber: template("plumber", "split", "stack", false, {
    catalogEyebrow: "Plumbing services",
    catalogHeading: "Clear help for leaks, heating and installations.",
    featuredHeading: "Recent work",
    featuredSubheading: "Completed plumbing projects, shown honestly.",
  }),
  electrician: template("electrician", "split", "columns", false, {
    catalogEyebrow: "Electrical services",
    catalogHeading: "Safe, qualified work for homes and businesses.",
    featuredHeading: "Recent work",
    featuredSubheading: "Installations and repairs from the field.",
  }),
  builder: template("builder", "immersive", "cards", true, {
    catalogEyebrow: "Building services",
    catalogHeading: "From repair work to full projects.",
    featuredHeading: "Project gallery",
    featuredSubheading: "Finished work and the places it belongs to.",
  }),
  repair: template("repair", "card", "stack", false, {
    catalogEyebrow: "Repair services",
    catalogHeading: "Diagnose the problem. Explain the fix.",
    featuredHeading: "Recent repairs",
    featuredSubheading: "Practical work, documented clearly.",
  }),
  artisan: template("artisan", "immersive", "cards", true, {
    catalogEyebrow: "Craft and commissions",
    catalogHeading: "Made, restored and finished with care.",
    featuredHeading: "Selected projects",
    featuredSubheading: "A portfolio of real commissioned work.",
  }),
  "general-trades": template("general-trades", "split", "columns", true, {
    catalogEyebrow: "Services",
    catalogHeading: "The work covered, in plain language.",
    featuredHeading: "Recent projects",
    featuredSubheading: "Evidence of the work, not stock promises.",
  }),
};

function template(
  id: LocalServiceTradeType,
  heroLayout: LocalServiceTemplate["heroLayout"],
  catalogLayout: LocalServiceTemplate["catalogLayout"],
  showProjectImagesByDefault: boolean,
  copy: VerticalTemplateCopy,
): LocalServiceTemplate {
  return {
    id,
    heroLayout,
    catalogLayout,
    brandClassName: "font-bold tracking-[-0.035em]",
    titleClassName: sharedTitle,
    sectionClassName: "border-t-2 border-current/15 pt-6",
    showProjectImagesByDefault,
    copy: { en: copy },
  };
}

export function resolveLocalServiceTemplateFromAttributes(
  attributes: LocalServiceAttributes,
): LocalServiceTemplate {
  return localServiceTemplates[attributes.tradeType];
}
