import { createHash } from "node:crypto";
import { z } from "zod";
import type { VerticalConfig } from "@/lib/verticals/types";

const allowedEconomicalModels = new Set([
  "google/gemini-3.1-flash-image",
  "google/gemini-2.5-flash-image",
]);

const positiveInteger = (fallback: number, maximum: number) =>
  z.coerce.number().int().positive().max(maximum).default(fallback);

const photoSystemConfigSchema = z
  .object({
    model: z
      .string()
      .trim()
      .refine(
        (model) => allowedEconomicalModels.has(model),
        "PHOTO_ENHANCEMENT_MODEL must be an approved fast image-edit model",
      )
      .default("google/gemini-3.1-flash-image"),
    discoveryMaxImages: positiveInteger(8, 50),
    ingestConcurrency: positiveInteger(4, 6),
    enhancementConcurrency: positiveInteger(2, 4),
    batchMaxImages: positiveInteger(6, 10),
    estimatedCostMicros: positiveInteger(25_000, 1_000_000),
    perImageCostCeilingMicros: positiveInteger(50_000, 1_000_000),
    perSiteCostCeilingMicros: positiveInteger(500_000, 20_000_000),
  })
  .superRefine((value, context) => {
    if (value.estimatedCostMicros > value.perImageCostCeilingMicros) {
      context.addIssue({
        code: "custom",
        path: ["estimatedCostMicros"],
        message: "Estimated image cost exceeds the per-image ceiling",
      });
    }
    if (value.perImageCostCeilingMicros > value.perSiteCostCeilingMicros) {
      context.addIssue({
        code: "custom",
        path: ["perImageCostCeilingMicros"],
        message: "Per-image ceiling exceeds the per-site ceiling",
      });
    }
  });

export type PhotoSystemConfig = z.infer<typeof photoSystemConfigSchema>;

export function getPhotoSystemConfig(
  env: Record<string, string | undefined> = process.env,
): PhotoSystemConfig {
  return photoSystemConfigSchema.parse({
    model: env.PHOTO_ENHANCEMENT_MODEL ?? env.OPENROUTER_IMAGE_MODEL,
    discoveryMaxImages: env.PHOTO_DISCOVERY_MAX_IMAGES,
    ingestConcurrency: env.PHOTO_INGEST_CONCURRENCY,
    enhancementConcurrency: env.PHOTO_ENHANCEMENT_CONCURRENCY,
    batchMaxImages: env.PHOTO_ENHANCEMENT_BATCH_MAX_IMAGES,
    estimatedCostMicros: env.PHOTO_ENHANCEMENT_ESTIMATED_COST_MICROS,
    perImageCostCeilingMicros:
      env.PHOTO_ENHANCEMENT_PER_IMAGE_CEILING_MICROS,
    perSiteCostCeilingMicros:
      env.PHOTO_ENHANCEMENT_PER_SITE_CEILING_MICROS,
  });
}

export function photoEnhancementConfigVersion(
  config: PhotoSystemConfig,
  vertical: Pick<VerticalConfig, "id" | "imageEnhancement">,
  enhancementNotes?: string,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        policy: "fidelity-edit-v1",
        model: config.model,
        vertical: vertical.id,
        rules: vertical.imageEnhancement,
        enhancementNotes: enhancementNotes?.trim() || null,
      }),
    )
    .digest("hex")
    .slice(0, 16);
}

export function enhancementReservationMicros(input: {
  configuredEstimateMicros: number;
  perImageCeilingMicros: number;
}): number {
  if (input.configuredEstimateMicros > input.perImageCeilingMicros) {
    throw new Error("The configured enhancement exceeds the per-image ceiling");
  }
  return input.configuredEstimateMicros;
}

export function canReservePhotoEnhancement(input: {
  committedMicros: number;
  reservationMicros: number;
  siteCeilingMicros: number;
}): boolean {
  return (
    input.committedMicros >= 0 &&
    input.reservationMicros >= 0 &&
    input.committedMicros + input.reservationMicros <= input.siteCeilingMicros
  );
}

export function photoEnhancementIdempotencyKey(input: {
  siteId: string;
  photoId: string;
  requestKey: string;
}): string {
  return `photo:${createHash("sha256")
    .update(`${input.siteId}\0${input.photoId}\0${input.requestKey}`)
    .digest("hex")}`;
}

export function recordedEnhancementCostMicros(
  providerCostMicros: number | null,
  reservedMicros: number,
  perImageCeilingMicros: number,
): number {
  if (perImageCeilingMicros < 1) {
    throw new Error("The per-image ceiling must be positive");
  }
  if (providerCostMicros === null || !Number.isFinite(providerCostMicros)) {
    return reservedMicros;
  }
  return Math.max(0, Math.ceil(providerCostMicros));
}

export async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("Concurrency must be a positive integer");
  }
  const output = new Array<R>(values.length);
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        output[index] = await mapper(values[index]!, index);
      }
    }),
  );
  return output;
}
