import type {
  LinkClassificationHint,
  ProviderDefinition,
} from "@/lib/verticals/types";

export const localServiceProviders: ProviderDefinition[] = [
  provider("WhatsApp", /wa\.me|whatsapp\.com/i, "contact"),
  provider("Jobber", /getjobber\.com|clienthub\.getjobber/i, "quote"),
  provider("Housecall Pro", /housecallpro\.com/i, "quote"),
  provider("ServiceM8", /servicem8\.com/i, "quote"),
  provider("Tradify", /tradifyhq\.com|tradify\.com/i, "quote"),
  provider("Checkatrade", /checkatrade\.com/i, "quote"),
  provider("MyBuilder", /mybuilder\.com/i, "quote"),
  provider("Rated People", /ratedpeople\.com/i, "quote"),
  provider("Bark", /bark\.com/i, "quote"),
  provider("Instagram", /instagram\.com/i, "social"),
  provider("Facebook", /facebook\.com/i, "social"),
  provider("LinkedIn", /linkedin\.com/i, "social"),
];

function provider(
  name: string,
  pattern: RegExp,
  type: ProviderDefinition["type"],
): ProviderDefinition {
  return { name, pattern, classificationPattern: pattern, type };
}

export const localServiceLinkKeywordHints: LinkClassificationHint[] = [
  {
    type: "contact",
    pattern: /whatsapp|wa\.me|message us|chat with us/i,
  },
  {
    type: "quote",
    pattern:
      /quote|estimate|enquiry|inquiry|jobber|housecall|servicem8|tradify|checkatrade|mybuilder|ratedpeople|bark/i,
  },
  {
    type: "booking",
    pattern: /book|schedule|appointment|callout/i,
  },
  {
    type: "social",
    pattern: /instagram|facebook|linkedin|tiktok|pinterest/i,
  },
];

export const localServiceRelevantPathPattern =
  /(?:service|services|plumb|electric|build|repair|maintenance|project|portfolio|gallery|work|credential|certif|licen[cs]|insurance|insured|area|location|coverage|emergency|callout|contact|quote|estimate|about|team)/i;
