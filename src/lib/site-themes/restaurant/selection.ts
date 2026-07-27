import {
  RESTAURANT_THEME_RENDERER_VERSION,
  RESTAURANT_THEME_SCHEMA_VERSION,
  restaurantAiThemeOutputSchema,
  restaurantDesignProfileSchema,
  restaurantThemeSelectionSchema,
  type RestaurantAiThemeOutput,
  type RestaurantDesignProfile,
  type RestaurantThemeId,
  type RestaurantThemeSelection,
} from "@/lib/site-themes/restaurant/contracts";
import {
  findRestaurantThemeManifest,
  getRestaurantThemeManifest,
  listRestaurantThemeManifests,
  type RestaurantThemeManifest,
} from "@/lib/site-themes/restaurant/registry";
import { mergeRestaurantThemeTokens } from "@/lib/site-themes/restaurant/tokens";

export const DEFAULT_RESTAURANT_DESIGN_PROFILE =
  restaurantDesignProfileSchema.parse({
    serviceModel: "full-service",
    primaryIntent: "reserve",
    menuExperience: "catalog",
    brandTraits: ["classic", "craft"],
    pricePosition: "midmarket",
    locationCount: 1,
    photographyQuality: "limited",
  });

type ScoredTheme = {
  manifest: RestaurantThemeManifest;
  score: number;
  reasons: string[];
};

function includes<T>(values: readonly T[], value: T): boolean {
  return values.includes(value);
}

function scoreTheme(
  manifest: RestaurantThemeManifest,
  profile: RestaurantDesignProfile,
): ScoredTheme {
  let score = 0;
  const reasons: string[] = [];
  const fit = manifest.fitSignals;
  const avoid = manifest.avoidanceSignals;

  if (includes(fit.serviceModels, profile.serviceModel)) {
    score += 6;
    reasons.push(`Fits the ${profile.serviceModel.replaceAll("-", " ")} model`);
  }
  if (includes(fit.primaryIntents, profile.primaryIntent)) {
    score += 5;
    reasons.push(`Keeps ${profile.primaryIntent} as the primary action`);
  }
  if (includes(fit.menuExperiences, profile.menuExperience)) {
    score += 5;
    reasons.push(`Supports a ${profile.menuExperience} menu experience`);
  }
  const matchingTraits = profile.brandTraits.filter((trait) =>
    includes(fit.brandTraits, trait),
  );
  score += matchingTraits.length * 2;
  if (matchingTraits[0]) {
    reasons.push(`Matches the ${matchingTraits.join(" and ")} brand character`);
  }
  if (includes(fit.pricePositions, profile.pricePosition)) score += 2;
  if (includes(fit.photographyQualities, profile.photographyQuality)) {
    score += 2;
  }
  if (profile.locationCount > 1 && fit.multipleLocations) score += 1;

  if (includes(avoid.serviceModels, profile.serviceModel)) score -= 7;
  if (includes(avoid.primaryIntents, profile.primaryIntent)) score -= 6;
  if (includes(avoid.menuExperiences, profile.menuExperience)) score -= 6;
  if (
    includes(avoid.photographyQualities, profile.photographyQuality)
  ) {
    score -= 3;
  }

  return {
    manifest,
    score,
    reasons: reasons.slice(0, 4),
  };
}

export function scoreRestaurantThemes(
  input: RestaurantDesignProfile,
): ScoredTheme[] {
  const profile = restaurantDesignProfileSchema.parse(input);
  return listRestaurantThemeManifests()
    .map((manifest) => scoreTheme(manifest, profile))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.manifest.id.localeCompare(right.manifest.id),
    );
}

function resolvedSelection(
  input: RestaurantAiThemeOutput,
  source: "ai" | "deterministic" | "owner",
): RestaurantThemeSelection {
  const manifest = getRestaurantThemeManifest(input.themeId);
  return restaurantThemeSelectionSchema.parse({
    schemaVersion: RESTAURANT_THEME_SCHEMA_VERSION,
    themeId: input.themeId,
    rendererVersion: RESTAURANT_THEME_RENDERER_VERSION,
    source,
    confidence: input.confidence,
    reasons: input.reasons,
    alternatives: input.alternatives,
    tokens: mergeRestaurantThemeTokens(
      manifest.safeDefaultTokens,
      input.tokens,
    ),
  });
}

export function selectDeterministicRestaurantTheme(
  input: RestaurantDesignProfile,
): RestaurantThemeSelection {
  const scored = scoreRestaurantThemes(input);
  const [winner, firstAlternative, secondAlternative] = scored;
  if (!winner || !firstAlternative || !secondAlternative) {
    throw new Error(
      "Restaurant theme selection requires at least three registered themes",
    );
  }
  const alternatives: [RestaurantThemeId, RestaurantThemeId] = [
    firstAlternative.manifest.id,
    secondAlternative.manifest.id,
  ];
  const gap = winner.score - firstAlternative.score;
  const confidence = Math.min(0.95, Math.max(0.55, 0.62 + gap * 0.035));
  return resolvedSelection(
    {
      themeId: winner.manifest.id,
      confidence,
      reasons:
        winner.reasons.length > 0
          ? winner.reasons
          : ["Uses the safest fit for the available restaurant signals"],
      alternatives,
      tokens: {},
    },
    "deterministic",
  );
}

/**
 * The model never selects a renderer directly. It can only submit the closed
 * output schema; anything else falls back to the same deterministic scorer used
 * when no model is configured.
 */
export function selectRestaurantTheme(
  profileInput: RestaurantDesignProfile,
  aiOutput: unknown,
): RestaurantThemeSelection {
  const profile = restaurantDesignProfileSchema.parse(profileInput);
  const parsed = restaurantAiThemeOutputSchema.safeParse(aiOutput);
  return parsed.success
    ? resolvedSelection(parsed.data, "ai")
    : selectDeterministicRestaurantTheme(profile);
}

/**
 * Converts an owner choice into the same closed, versioned contract used by
 * automatic selection. Tokens always come from the registered theme manifest;
 * the dashboard can choose a renderer, but it cannot smuggle arbitrary style
 * values into the public site.
 */
export function selectOwnerRestaurantTheme(
  profileInput: RestaurantDesignProfile | undefined,
  themeId: RestaurantThemeId,
): RestaurantThemeSelection {
  const profile =
    restaurantDesignProfileSchema.safeParse(profileInput).data ??
    DEFAULT_RESTAURANT_DESIGN_PROFILE;
  const automatic = selectDeterministicRestaurantTheme(profile);
  const alternatives = [
    automatic.themeId,
    ...automatic.alternatives,
  ].filter((candidate) => candidate !== themeId);
  const [firstAlternative, secondAlternative] = alternatives;
  if (!firstAlternative || !secondAlternative) {
    throw new Error(
      "Owner theme selection requires at least three registered themes",
    );
  }

  return resolvedSelection(
    {
      themeId,
      confidence: 1,
      reasons: ["Selected explicitly by the restaurant owner"],
      alternatives: [firstAlternative, secondAlternative],
      tokens: {},
    },
    "owner",
  );
}

export function restoreAutomaticRestaurantTheme(
  profileInput: RestaurantDesignProfile | undefined,
): RestaurantThemeSelection {
  const profile =
    restaurantDesignProfileSchema.safeParse(profileInput).data ??
    DEFAULT_RESTAURANT_DESIGN_PROFILE;
  return selectDeterministicRestaurantTheme(profile);
}

/**
 * Compatibility is deliberately nullable. Missing or malformed structured
 * selection means "use the existing cuisine-era renderer", not "silently move
 * this customer onto the new default theme".
 */
export function parseRestaurantThemeSelection(
  input: unknown,
): RestaurantThemeSelection | null {
  const parsed = restaurantThemeSelectionSchema.safeParse(input);
  if (!parsed.success) return null;
  const manifest = findRestaurantThemeManifest(parsed.data.themeId);
  if (!manifest || manifest.rendererVersion !== parsed.data.rendererVersion) {
    return null;
  }
  return {
    ...parsed.data,
    tokens: mergeRestaurantThemeTokens(
      manifest.safeDefaultTokens,
      parsed.data.tokens,
    ),
  };
}

export function normalizeGeneratedRestaurantThemeSelection(
  profileInput: RestaurantDesignProfile | undefined,
  generatedSelection: unknown,
): {
  designProfile: RestaurantDesignProfile;
  themeSelection: RestaurantThemeSelection;
} {
  const profile =
    restaurantDesignProfileSchema.safeParse(profileInput).data ??
    DEFAULT_RESTAURANT_DESIGN_PROFILE;
  const parsed = restaurantThemeSelectionSchema.safeParse(generatedSelection);
  if (!parsed.success) {
    return {
      designProfile: profile,
      themeSelection: selectDeterministicRestaurantTheme(profile),
    };
  }

  return {
    designProfile: profile,
    themeSelection: selectRestaurantTheme(profile, {
      themeId: parsed.data.themeId,
      confidence: parsed.data.confidence,
      reasons: parsed.data.reasons,
      alternatives: parsed.data.alternatives,
      tokens: parsed.data.tokens,
    }),
  };
}
